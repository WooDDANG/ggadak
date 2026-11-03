import { z } from 'zod';

export interface GuildAccessEvent {
  streamId: string;
  sequence: number;
  kind:
    | 'reset'
    | 'heartbeat'
    | 'disconnect'
    | 'member_remove'
    | 'member_change'
    | 'member_join'
    | 'guild_change'
    | 'guild_available'
    | 'guild_remove'
    | 'guild_unavailable';
  guildId?: string;
  userId?: string;
  guildIds?: string[];
  unavailableGuildIds?: string[];
  membersIntent?: boolean;
  connected?: boolean;
}

/** Ordered invalidations; only a live, fully drained Gateway stream can renew its lease. */
export const GuildAccessEventSchema = z
  .object({
    streamId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    kind: z.enum([
      'reset',
      'heartbeat',
      'disconnect',
      'member_remove',
      'member_change',
      'member_join',
      'guild_change',
      'guild_available',
      'guild_remove',
      'guild_unavailable',
    ]),
    guildId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    guildIds: z.array(z.string().min(1)).max(10000).optional(),
    unavailableGuildIds: z.array(z.string().min(1)).max(10000).optional(),
    membersIntent: z.boolean().optional(),
    connected: z.boolean().optional(),
  })
  .strict();

export const GuildAccessPolicy = {
  heartbeatMs: 10_000,
  leaseMs: 35_000,
} as const;
