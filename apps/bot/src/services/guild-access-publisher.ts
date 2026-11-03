import {
  createLogger,
  DeliveryPolicy,
  GuildAccessEventSchema,
  GuildAccessPolicy,
} from '@ggaddak/shared';
import type { GuildAccessEvent } from '@ggaddak/shared';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const logger = createLogger('BOT-GUILD-ACCESS');

export interface GuildAccessSnapshot {
  guildIds: string[];
  unavailableGuildIds?: string[];
  membersIntent: boolean;
}

export interface GuildAccessPublisherOptions {
  backendUrl: string;
  directory?: string;
  token?: string;
  transport?: typeof fetch;
  isGatewayReady?: () => boolean;
}

export interface GuildAccessChange {
  kind: Exclude<GuildAccessEvent['kind'], 'reset' | 'heartbeat'>;
  guildId?: string;
  userId?: string;
}

interface Journal {
  pending: GuildAccessEvent[];
  retained: GuildAccessEvent[];
}

class GuildAccessDeliveryError extends Error {
  constructor(readonly status: number) {
    super(`Guild access delivery failed (HTTP ${status})`);
  }
}

/** One publisher owns its journal. A new process must invalidate old proofs before compacting it. */
export class GuildAccessPublisher {
  private readonly file: string;
  private readonly transport: typeof fetch;
  private readonly endpoint: string;
  private streamId = randomUUID();
  private sequence = 0;
  private acknowledged = 0;
  private pending: GuildAccessEvent[] = [];
  private retained: GuildAccessEvent[] = [];
  private snapshot?: GuildAccessSnapshot;
  private connected = false;
  private needsReset = true;
  private resetEnvelope?: GuildAccessEvent;
  private resetRequested = false;
  private hasBeenReady = false;
  private loaded = false;
  private closed = false;
  private queuedChanges = 0;
  private timer?: ReturnType<typeof setInterval>;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly options: GuildAccessPublisherOptions) {
    this.file = join(
      options.directory ?? resolve(process.env.GUILD_ACCESS_DELIVERY_DIR || '.data/guild-access'),
      'journal.json',
    );
    this.transport = options.transport ?? fetch;
    this.endpoint = `${options.backendUrl.replace(/\/$/, '')}/api/v1/internal/guild-access/events`;
  }

  ready(snapshot: GuildAccessSnapshot): Promise<void> {
    const newGatewaySession = this.hasBeenReady;
    this.hasBeenReady = true;
    this.snapshot = {
      ...snapshot,
      guildIds: [...snapshot.guildIds],
      unavailableGuildIds: [...(snapshot.unavailableGuildIds ?? [])],
    };
    this.connected = true;
    this.resetRequested = true;
    this.startTimer();
    return this.serialize(async () => {
      await this.load();
      if (newGatewaySession || !this.needsReset) this.rotate();
      this.resetRequested = false;
      await this.deliver();
    });
  }

  publish(change: GuildAccessChange): Promise<void> {
    if (this.snapshot && change.guildId) {
      const guilds = new Set(this.snapshot.guildIds);
      const unavailable = new Set(this.snapshot.unavailableGuildIds);
      if (change.kind === 'guild_available') {
        guilds.add(change.guildId);
        unavailable.delete(change.guildId);
      }
      if (change.kind === 'guild_unavailable') {
        guilds.add(change.guildId);
        unavailable.add(change.guildId);
      }
      if (change.kind === 'guild_remove') {
        guilds.delete(change.guildId);
        unavailable.delete(change.guildId);
      }
      this.snapshot.guildIds = [...guilds];
      this.snapshot.unavailableGuildIds = [...unavailable];
    }
    this.queuedChanges++;
    return this.serialize(async () => {
      try {
        await this.load();
        this.pending.push({ ...change, streamId: this.streamId, sequence: ++this.sequence });
        await this.persist();
        await this.deliver(true);
      } finally {
        this.queuedChanges--;
      }
    });
  }

  disconnect(): Promise<void> {
    // Stop live leases immediately, even if a previous HTTP delivery is still in flight.
    this.connected = false;
    return this.publish({ kind: 'disconnect' });
  }

  resume(snapshot: GuildAccessSnapshot): Promise<void> {
    this.snapshot = {
      ...snapshot,
      guildIds: [...snapshot.guildIds],
      unavailableGuildIds: [...(snapshot.unavailableGuildIds ?? [])],
    };
    this.connected = true;
    this.startTimer();
    return this.flush();
  }

  flush(): Promise<void> {
    return this.serialize(async () => {
      await this.load();
      await this.deliver();
    });
  }

  close(): void {
    this.closed = true;
    this.connected = false;
    if (this.timer) clearInterval(this.timer);
  }

  private serialize(operation: () => Promise<void>): Promise<void> {
    const next = this.tail.then(async () => {
      if (!this.closed) await operation();
    });
    this.tail = next.catch(() => {});
    return next;
  }

  private startTimer(): void {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => {
      void this.flush().catch(error =>
        logger.warn(`Guild access synchronization unavailable: ${error.message}`),
      );
    }, GuildAccessPolicy.heartbeatMs);
    this.timer.unref();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    let previous: string;
    try {
      previous = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.loaded = true;
      return;
    }
    // Preserve prior-process invalidations until BE acknowledges an authoritative reset.
    const journal = JSON.parse(previous) as Journal;
    if (!Array.isArray(journal.pending) || !Array.isArray(journal.retained))
      throw new Error('Invalid guild access journal; live cache trust cannot be renewed');
    this.retained = [...journal.retained, ...journal.pending].map(event =>
      GuildAccessEventSchema.parse(event),
    );
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const directory = dirname(this.file);
    await mkdir(directory, { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(
      temporary,
      JSON.stringify({ pending: this.pending, retained: this.retained } satisfies Journal),
      { mode: 0o600 },
    );
    await rename(temporary, this.file);
  }

  private rotate(): void {
    this.retained.push(...this.pending);
    this.pending = [];
    this.streamId = randomUUID();
    this.sequence = 0;
    this.acknowledged = 0;
    this.needsReset = true;
    this.resetEnvelope = undefined;
  }

  private async send(event: GuildAccessEvent): Promise<void> {
    if (!this.options.token)
      throw new Error('Bot service token is required for guild access delivery');
    const response = await this.transport(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.token}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(DeliveryPolicy.serviceTimeoutMs),
    });
    if (!response.ok) throw new GuildAccessDeliveryError(response.status);
    await response.arrayBuffer();
  }

  private async deliver(ownChange = false): Promise<void> {
    if (!this.snapshot) return;
    if (this.needsReset) {
      if (!this.connected || this.resetRequested || this.options.isGatewayReady?.() === false)
        return;
      await this.persist();
      this.resetEnvelope ??= {
        kind: 'reset',
        streamId: this.streamId,
        sequence: 0,
        guildIds: [...this.snapshot.guildIds],
        unavailableGuildIds: [...(this.snapshot.unavailableGuildIds ?? [])],
        membersIntent: this.snapshot.membersIntent,
        connected: true,
      };
      await this.send(this.resetEnvelope);
      // The reset invalidated every prior proof, so old epochs can now be compacted safely.
      this.needsReset = false;
      this.retained = [];
      this.acknowledged = 0;
      await this.persist();
    }
    try {
      while (this.pending.length) {
        await this.persist();
        const event = this.pending[0];
        await this.send(event);
        this.pending.shift();
        this.acknowledged = event.sequence;
        await this.persist();
      }
      if (
        this.connected &&
        this.options.isGatewayReady?.() !== false &&
        !this.resetRequested &&
        this.queuedChanges <= (ownChange ? 1 : 0)
      ) {
        await this.send({
          kind: 'heartbeat',
          streamId: this.streamId,
          sequence: this.acknowledged,
          connected: true,
        });
      }
    } catch (error) {
      if (error instanceof GuildAccessDeliveryError && error.status === 409) {
        this.rotate();
        await this.persist();
      }
      throw error;
    }
  }
}
