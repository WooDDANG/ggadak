import { createLogger } from '@ggaddak/shared';
import { Events } from 'discord.js';
import type { Client } from 'discordx';
import type {
  GuildAccessPublisher,
  GuildAccessSnapshot,
} from '../services/guild-access-publisher.js';

const logger = createLogger('GUILD-ACCESS-EVENTS');

interface GuildDispatch {
  op: number;
  t?: string;
  d?: {
    id?: string;
    guild_id?: string;
    unavailable?: boolean;
    owner_id?: string;
    user?: { id: string };
    roles?: string[];
    role?: { id: string; permissions?: string };
  };
}

/** Raw Gateway dispatches precede SDK cache filtering and include Resume replay. No Discord REST. */
export function registerGuildAccessEvents(
  client: Client,
  publisher: GuildAccessPublisher,
  membersIntent: boolean,
): void {
  const disconnected = new Set<number>();
  let started = false;
  let requiresReset = false;
  const snapshot = (): GuildAccessSnapshot => ({
    guildIds: [...client.guilds.cache.keys()],
    unavailableGuildIds: [...client.guilds.cache.values()]
      .filter(guild => !guild.available)
      .map(guild => guild.id),
    membersIntent,
  });
  const report = (operation: Promise<void>) => {
    void operation.catch(error =>
      logger.warn(`Guild access event retained for recovery: ${error.message}`),
    );
  };
  const reconnect = (shardId: number) => {
    disconnected.add(shardId);
    if (started) report(publisher.disconnect());
  };
  client.on(Events.ClientReady, () => {
    if (started) return;
    started = true;
    disconnected.clear();
    report(publisher.ready(snapshot()));
  });
  client.on(Events.ShardDisconnect, (_event, shardId) => reconnect(shardId));
  client.on(Events.ShardReconnecting, reconnect);
  client.on(Events.ShardError, (_error, shardId) => reconnect(shardId));
  client.on(Events.Invalidated, () => {
    requiresReset = true;
    if (started) report(publisher.disconnect());
  });
  client.on(Events.ShardResume, shardId => {
    disconnected.delete(shardId);
    if (!started || disconnected.size) return;
    if (requiresReset) {
      requiresReset = false;
      report(publisher.ready(snapshot()));
    } else report(publisher.resume(snapshot()));
  });
  client.on(Events.ShardReady, shardId => {
    if (!started) return;
    // Ready after startup means Identify, not Resume: missed events cannot be replayed.
    requiresReset = true;
    disconnected.delete(shardId);
    if (disconnected.size) return;
    requiresReset = false;
    report(publisher.ready(snapshot()));
  });
  // High-level member events are absent for uncached members and suppressed during Resume.
  // Listening only here also avoids double-processing the SDK's derived high-level events.
  client.on(Events.Raw, (packet: GuildDispatch) => {
    if (packet.op !== 0 || !packet.d) return;
    const data = packet.d;
    const guildId = data.guild_id ?? data.id;
    if (!guildId) return;
    const guild = client.guilds.cache.get(guildId);
    switch (packet.t) {
      case 'GUILD_MEMBER_REMOVE':
      case 'GUILD_MEMBER_ADD':
        if (membersIntent && data.user?.id)
          report(
            publisher.publish({
              kind: packet.t === 'GUILD_MEMBER_REMOVE' ? 'member_remove' : 'member_join',
              guildId,
              userId: data.user.id,
            }),
          );
        return;
      case 'GUILD_MEMBER_UPDATE': {
        if (!membersIntent || !data.user?.id || !data.roles) return;
        const member = guild?.members?.cache.get(data.user.id);
        const previous = member && [...member.roles.cache.keys()].filter(id => id !== guildId);
        if (
          !previous ||
          previous.length !== data.roles.length ||
          data.roles.some(id => !previous.includes(id))
        )
          report(publisher.publish({ kind: 'member_change', guildId, userId: data.user.id }));
        return;
      }
      case 'GUILD_ROLE_UPDATE': {
        const previous = data.role && guild?.roles?.cache.get(data.role.id);
        if (!previous || previous.permissions.bitfield.toString() !== data.role?.permissions)
          report(publisher.publish({ kind: 'guild_change', guildId }));
        return;
      }
      case 'GUILD_ROLE_CREATE':
      case 'GUILD_ROLE_DELETE':
        report(publisher.publish({ kind: 'guild_change', guildId }));
        return;
      case 'GUILD_UPDATE':
        if (data.owner_id && guild?.ownerId !== data.owner_id)
          report(publisher.publish({ kind: 'guild_change', guildId }));
        return;
      case 'GUILD_CREATE':
        report(
          publisher.publish({
            kind: data.unavailable ? 'guild_unavailable' : 'guild_available',
            guildId,
          }),
        );
        return;
      case 'GUILD_DELETE':
        report(
          publisher.publish({
            kind: data.unavailable ? 'guild_unavailable' : 'guild_remove',
            guildId,
          }),
        );
        return;
    }
  });
}
