import { randomUUID } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import type { Message, TextChannel } from 'discord.js';
import { BackendApiService, BackendRequestError } from './backend-api.service.js';
import type { ScanOptions } from './harvester.service.js';
import { analysisScheduler } from './channel-scheduler.js';

interface Transfer {
  id: string;
  upper: string;
  lower: string;
  before?: string;
  pages: number;
  ranges: number;
  messages: number;
  bytes: number;
  collected: boolean;
  uploaded: boolean;
  page: number;
  part: number;
  rangeIndex: number;
  after: string;
  cutoff: number | null;
  limit?: number;
  uploadedAt?: number;
}
/** Disk-backed, fixed-range producer. A receipt, rather than an AI result, permits progress. */
export class ChannelTransfer {
  constructor(private backend: BackendApiService) {}
  run(channel: TextChannel, options: ScanOptions) {
    return analysisScheduler.run(`transfer:${this.backend.transferDirectory(channel.id)}`, () =>
      this.transfer(channel, options),
    );
  }
  private raw(message: Message) {
    const reactions = [...(message.reactions?.cache.values() ?? [])].map(r => ({
      emoji: r.emoji.name ?? 'unknown',
      count: r.count ?? 0,
      botCount: r.me ? 1 : 0,
    }));
    return {
      id: message.id,
      author: message.author?.username ?? 'unknown',
      isBot: message.author?.bot ?? false,
      content: message.content ?? '',
      createdAt: message.createdAt.toISOString(),
      replyingTo: message.reference?.messageId,
      reactions,
      reactionCount: reactions.reduce((sum, r) => sum + r.count, 0),
    };
  }
  private async transfer(channel: TextChannel, options: ScanOptions) {
    const id = `${options.requestId ?? randomUUID()}:${channel.guild.id}:${channel.id}`;
    let saved: Transfer | null = await this.backend.readTransfer(id, 'manifest.json');
    if (!saved) {
      const checkpoint = await this.backend.getCheckpoint(channel.id);
      if (options.initialOnly && checkpoint)
        return { scannedCount: 0, decisionsCount: 0, pendingAnalysis: false };
      const incremental = !options.full && !options.forceFullSync && !options.hours;
      saved = {
        id,
        upper: '0',
        lower: incremental ? (checkpoint ?? '0') : '0',
        pages: 0,
        ranges: 0,
        messages: 0,
        bytes: 0,
        collected: false,
        uploaded: false,
        page: -1,
        part: 0,
        rangeIndex: 0,
        after: '0',
        cutoff: options.hours
          ? Date.now() - options.hours * 3600000
          : options.initialOnly
            ? Date.now() - (options.lookbackDays ?? 3) * 86400000
            : null,
        limit: options.limit,
      };
      await this.backend.writeTransfer(id, 'manifest.json', saved);
    }
    const state = saved;
    if (state.uploaded)
      return { scannedCount: state.messages, decisionsCount: 0, pendingAnalysis: true };
    const capacity = await this.backend.queueRequest('/capacity', 'GET');
    if (capacity?.acceptingScans === false) throw new BackendRequestError(429);
    const maxBytes = Number(process.env.BOT_SCAN_MAX_BYTES ?? 64 * 1024 * 1024);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
      throw new Error('Invalid BOT_SCAN_MAX_BYTES');
    while (!state.collected) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(state.before ? { before: state.before } : {}),
      });
      const all = [...batch.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      if (!state.pages) state.upper = all.at(-1)?.id ?? state.lower;
      let selected = all.filter(
        m =>
          BigInt(m.id) > BigInt(state.lower) &&
          (!state.cutoff || m.createdTimestamp >= state.cutoff),
      );
      if (state.limit) selected = selected.slice(-Math.max(0, state.limit - state.messages));
      const parts: Array<ReturnType<ChannelTransfer['raw']>[]> = [];
      let part: Array<ReturnType<ChannelTransfer['raw']>> = [];
      for (const message of selected) {
        const value = this.raw(message);
        if (part.length && Buffer.byteLength(JSON.stringify([...part, value])) > 180000) {
          parts.push(part);
          part = [];
        }
        part.push(value);
      }
      if (part.length) parts.push(part);
      const bytes = Buffer.byteLength(JSON.stringify(parts));
      if (state.bytes + bytes > maxBytes)
        throw new Error(
          'Channel receive capacity exceeded; adjust BOT_SCAN_MAX_BYTES before resuming',
        );
      const disk = await statfs(this.backend.transferDirectory(id));
      if (disk.bavail * disk.bsize < bytes + 64 * 1024 * 1024)
        throw new Error('Bot receive disk capacity unavailable');
      if (parts.length) {
        await this.backend.writeTransfer(id, `page-${state.pages}.json`, parts);
        state.pages++;
        state.ranges += parts.length;
        state.messages += selected.length;
        state.bytes += bytes;
      }
      const oldest = all[0];
      state.collected =
        !oldest ||
        batch.size < 100 ||
        BigInt(oldest.id) <= BigInt(state.lower) ||
        (!!state.cutoff && oldest.createdTimestamp < state.cutoff) ||
        (!!state.limit && state.messages >= state.limit);
      if (oldest && !state.collected) {
        if (state.before === oldest.id) throw new Error('Discord pagination did not advance');
        state.before = oldest.id;
      }
      if (state.collected) {
        state.page = state.pages - 1;
        const first = state.pages
          ? await this.backend.readTransfer(id, `page-${state.page}.json`)
          : null;
        if (
          (state.lower === '0' || (state.limit && state.messages >= state.limit)) &&
          first?.[0]?.[0]
        )
          state.lower = String(BigInt(first[0][0].id) - 1n);
        if (!state.messages) state.upper = state.lower;
        state.after = state.lower;
      }
      await this.backend.writeTransfer(id, 'manifest.json', state);
    }
    await this.backend.queueRequest('/scans', 'POST', {
      id,
      guildId: channel.guild.id,
      channelId: channel.id,
      upperMessageId: state.upper,
      afterMessageId: state.lower,
      jobId: options.jobId,
      jobOwner: options.jobOwner,
    });
    while (state.page >= 0) {
      const parts = await this.backend.readTransfer(id, `page-${state.page}.json`);
      if (!parts) throw new Error('Retained scan page missing');
      while (state.part < parts.length) {
        const rawMessages = parts[state.part];
        const range = {
          afterMessageId: state.after,
          startMessageId: rawMessages[0].id,
          endMessageId: rawMessages.at(-1).id,
        };
        const payload = {
          requestId: `${id}:range:${state.rangeIndex}`,
          guildId: channel.guild.id,
          channelId: channel.id,
          channelName: channel.name,
          rawMessages,
        };
        await this.backend.deliverScanSegment(payload, id, state.rangeIndex, range);
        state.after = range.endMessageId;
        state.part++;
        state.rangeIndex++;
        await this.backend.writeTransfer(id, 'manifest.json', state);
      }
      state.page--;
      state.part = 0;
      await this.backend.writeTransfer(id, 'manifest.json', state);
    }
    const receipt = await this.backend.queueRequest(
      `/scans/${encodeURIComponent(id)}/seal`,
      'POST',
      { expectedRanges: state.ranges },
    );
    if (!receipt?.sealed) {
      const missing = new Set<number>(receipt?.missing ?? []);
      let index = 0,
        after = state.lower;
      for (let page = state.pages - 1; page >= 0; page--) {
        const parts = await this.backend.readTransfer(id, `page-${page}.json`);
        if (!parts) throw new Error('Retained scan page missing');
        for (const rawMessages of parts) {
          const range = {
            afterMessageId: after,
            startMessageId: rawMessages[0].id,
            endMessageId: rawMessages.at(-1).id,
          };
          if (missing.has(index))
            await this.backend.queueRequest('/receipts', 'POST', {
              input: {
                requestId: `${id}:range:${index}`,
                guildId: channel.guild.id,
                channelId: channel.id,
                channelName: channel.name,
                rawMessages,
              },
              scanId: id,
              rangeIndex: index,
              range,
            });
          after = range.endMessageId;
          index++;
        }
      }
      const repaired = await this.backend.queueRequest(
        `/scans/${encodeURIComponent(id)}/seal`,
        'POST',
        { expectedRanges: state.ranges },
      );
      if (!repaired?.sealed) throw new Error('Scan receive gaps remain; retained for recovery');
    }
    state.uploaded = true;
    state.uploadedAt = Date.now();
    await this.backend.writeTransfer(id, 'manifest.json', state);
    return { scannedCount: state.messages, decisionsCount: 0, pendingAnalysis: true };
  }
}
