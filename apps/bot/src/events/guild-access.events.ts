import { createLogger } from '@ggaddak/shared';
import { Events } from 'discord.js';
import type { Client } from 'discordx';
import type {
  GuildAccessPublisher,
  GuildAccessSnapshot,
} from '../services/guild-access-publisher.js';

const logger = createLogger('GUILD-ACCESS-EVENTS');

/** Discord cache observations only: these listeners never query Discord's REST API. */
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
  client.on(Events.GuildMemberRemove, member => {
    if (membersIntent)
      report(
        publisher.publish({ kind: 'member_remove', guildId: member.guild.id, userId: member.id }),
      );
  });
  client.on(Events.GuildMemberAdd, member => {
    if (membersIntent)
      report(
        publisher.publish({ kind: 'member_join', guildId: member.guild.id, userId: member.id }),
      );
  });
  client.on(Events.GuildMemberUpdate, (previous, current) => {
    if (!membersIntent) return;
    if (
      previous.partial ||
      previous.roles.cache.size !== current.roles.cache.size ||
      previous.roles.cache.some(role => !current.roles.cache.has(role.id))
    ) {
      report(
        publisher.publish({ kind: 'member_change', guildId: current.guild.id, userId: current.id }),
      );
    }
  });
  client.on(Events.GuildRoleUpdate, (previous, current) => {
    if (previous.permissions.bitfield !== current.permissions.bitfield)
      report(publisher.publish({ kind: 'guild_change', guildId: current.guild.id }));
  });
  client.on(Events.GuildRoleDelete, role =>
    report(publisher.publish({ kind: 'guild_change', guildId: role.guild.id })),
  );
  client.on(Events.GuildUpdate, (previous, current) => {
    if (previous.ownerId !== current.ownerId)
      report(publisher.publish({ kind: 'guild_change', guildId: current.id }));
  });
  client.on(Events.GuildCreate, guild =>
    report(publisher.publish({ kind: 'guild_available', guildId: guild.id })),
  );
  client.on(Events.GuildDelete, guild =>
    report(publisher.publish({ kind: 'guild_remove', guildId: guild.id })),
  );
  client.on(Events.GuildUnavailable, guild =>
    report(publisher.publish({ kind: 'guild_unavailable', guildId: guild.id })),
  );
}
