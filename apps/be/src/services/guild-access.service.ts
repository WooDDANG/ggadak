import { GuildAccessPolicy, type GuildAccessEvent } from '@ggaddak/shared';
import type {
  GuildAccessControl,
  GuildAccessObservation,
  Membership,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import type { DiscordGuild } from '../adapters/discord-auth.adapter.js';

const CONTROL_ID = 'discord';
type Store = Prisma.TransactionClient;

/** Gateway observations revoke cached proofs; OAuth remains the authority for grants. */
export class GuildAccessService {
  constructor(
    private prisma: PrismaClient,
    private now: () => number = Date.now,
  ) {}

  async initialize() {
    // A receiver restart cannot assume that the previous Gateway delivery is still continuous.
    await this.prisma.$transaction(async tx => {
      await tx.guildAccessControl.upsert({
        where: { id: CONTROL_ID },
        create: { id: CONTROL_ID },
        update: {
          streamId: null,
          lastSequence: 0,
          connected: false,
          leaseUntil: null,
          revision: { increment: 1 },
        },
      });
      await tx.guildAccessObservation.updateMany({
        data: { revision: { increment: 1 }, available: false },
      });
    });
  }

  live(control: GuildAccessControl | null) {
    return Boolean(
      control?.connected && control.leaseUntil && control.leaseUntil.getTime() > this.now(),
    );
  }

  private covered(control: GuildAccessControl | null, observation: GuildAccessObservation | null) {
    return (
      this.live(control) &&
      Boolean(
        control?.membersIntent && observation?.available && observation.installed === 'installed',
      )
    );
  }

  async revision() {
    return (await this.prisma.guildAccessControl.findUniqueOrThrow({ where: { id: CONTROL_ID } }))
      .revision;
  }

  async trusted(membership: Membership) {
    const [control, observation] = await Promise.all([
      this.prisma.guildAccessControl.findUnique({ where: { id: CONTROL_ID } }),
      this.prisma.guildAccessObservation.findUnique({ where: { guildId: membership.guildId } }),
    ]);
    return this.covered(control, observation) && membership.guildRevision === observation?.revision;
  }

  async removed(userId: string, guildId: string) {
    const [removal, control, observation] = await Promise.all([
      this.prisma.guildAccessRemoval.findUnique({ where: { guildId_userId: { guildId, userId } } }),
      this.prisma.guildAccessControl.findUnique({ where: { id: CONTROL_ID } }),
      this.prisma.guildAccessObservation.findUnique({ where: { guildId } }),
    ]);
    return Boolean(removal && this.covered(control, observation));
  }

  async snapshotTrusted(userId: string) {
    const [user, memberships] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.membership.findMany({ where: { userId } }),
    ]);
    if (!user || user.guildsDirty || !memberships.length) return false;
    return (await Promise.all(memberships.map(m => this.trusted(m)))).every(Boolean);
  }

  async replaceMemberships(tx: Store, userId: string, guilds: DiscordGuild[], revision: number) {
    const control = await tx.guildAccessControl.findUniqueOrThrow({ where: { id: CONTROL_ID } });
    if (control.revision !== revision)
      throw new AppError('Discord permissions changed during verification; retry shortly', 503);
    await tx.membership.deleteMany({ where: { userId } });
    for (const guild of guilds) {
      const observation = await tx.guildAccessObservation.findUnique({
        where: { guildId: guild.id },
      });
      const removal = await tx.guildAccessRemoval.findUnique({
        where: { guildId_userId: { guildId: guild.id, userId } },
      });
      if (removal && this.covered(control, observation)) continue;
      await tx.guild.upsert({
        where: { id: guild.id },
        create: { id: guild.id, name: guild.name, icon: guild.icon },
        update: { name: guild.name, icon: guild.icon },
      });
      await tx.membership.create({
        data: {
          userId,
          guildId: guild.id,
          owner: guild.owner,
          permissions: guild.permissions,
          refreshedAt: new Date(this.now()),
          guildRevision: observation?.revision ?? -1,
        },
      });
      if (removal)
        await tx.guildAccessRemoval.delete({
          where: { guildId_userId: { guildId: guild.id, userId } },
        });
    }
    await tx.user.update({ where: { id: userId }, data: { guildsDirty: false } });
  }

  async observe(event: GuildAccessEvent) {
    const now = new Date(this.now());
    return this.prisma.$transaction(async tx => {
      const control = await tx.guildAccessControl.findUniqueOrThrow({ where: { id: CONTROL_ID } });
      if (event.kind === 'reset') {
        if (
          event.sequence !== 0 ||
          !event.guildIds ||
          event.membersIntent === undefined ||
          event.connected !== true
        )
          throw new AppError(
            'A reset requires a connected complete guild snapshot at sequence zero',
            400,
          );
        if (control.streamId === event.streamId) {
          if (control.lastSequence !== 0) throw new AppError('Stream reset is stale', 409);
          // Reset retries must not invalidate again or grant coverage after an expired lease.
          return { sequence: 0 };
        }
        if (control.streamId && this.live(control))
          throw new AppError('Another Gateway stream is active', 409);
        await tx.guildAccessObservation.updateMany({
          data: { installed: 'not_installed', available: false, revision: { increment: 1 } },
        });
        for (const guildId of new Set(event.guildIds)) {
          const unavailable = event.unavailableGuildIds?.includes(guildId) ?? false;
          await tx.guildAccessObservation.upsert({
            where: { guildId },
            create: {
              guildId,
              revision: 1,
              installed: unavailable ? 'unknown' : 'installed',
              available: !unavailable,
            },
            update: { installed: unavailable ? 'unknown' : 'installed', available: !unavailable },
          });
        }
        // All previous proofs were invalidated, so old epoch tombstones can be compacted.
        await tx.guildAccessRemoval.deleteMany();
        await tx.guildAccessControl.update({
          where: { id: CONTROL_ID },
          data: {
            streamId: event.streamId,
            lastSequence: 0,
            connected: true,
            membersIntent: event.membersIntent,
            leaseUntil: new Date(now.getTime() + GuildAccessPolicy.leaseMs),
            revision: { increment: 1 },
          },
        });
        return { sequence: 0 };
      }
      if (control.streamId !== event.streamId)
        throw new AppError('Gateway stream must reset before delivering events', 409);
      if (event.kind === 'heartbeat') {
        if (event.sequence !== control.lastSequence) {
          await tx.guildAccessControl.update({
            where: { id: CONTROL_ID },
            data: {
              streamId: null,
              connected: false,
              leaseUntil: null,
              revision: { increment: 1 },
            },
          });
          return { sequence: control.lastSequence, resetRequired: true };
        }
        await tx.guildAccessControl.update({
          where: { id: CONTROL_ID },
          data: {
            connected: event.connected === true,
            leaseUntil:
              event.connected === true ? new Date(now.getTime() + GuildAccessPolicy.leaseMs) : null,
          },
        });
        return { sequence: control.lastSequence };
      }
      if (event.sequence <= control.lastSequence) return { sequence: control.lastSequence };
      if (event.sequence !== control.lastSequence + 1) {
        // Do not trust a stream whose invalidations were lost or reordered.
        await tx.guildAccessControl.update({
          where: { id: CONTROL_ID },
          data: { streamId: null, connected: false, leaseUntil: null, revision: { increment: 1 } },
        });
        return { sequence: control.lastSequence, resetRequired: true };
      }
      if (event.kind !== 'disconnect' && !event.guildId)
        throw new AppError('Guild ID is required', 400);
      if (event.kind.startsWith('member_') && !event.userId)
        throw new AppError('User ID is required', 400);
      if (event.kind === 'disconnect') {
        await tx.guildAccessControl.update({
          where: { id: CONTROL_ID },
          data: { connected: false, leaseUntil: null },
        });
      } else if (event.kind === 'member_remove') {
        await tx.guildAccessRemoval.upsert({
          where: { guildId_userId: { guildId: event.guildId!, userId: event.userId! } },
          create: { guildId: event.guildId!, userId: event.userId! },
          update: {},
        });
        await tx.membership.deleteMany({ where: { userId: event.userId, guildId: event.guildId } });
      } else if (event.kind === 'member_change' || event.kind === 'member_join') {
        await tx.membership.updateMany({
          where: { userId: event.userId, guildId: event.guildId },
          data: { guildRevision: -1 },
        });
        if (event.kind === 'member_join') {
          await tx.guildAccessRemoval.deleteMany({
            where: { guildId: event.guildId, userId: event.userId },
          });
          await tx.user.updateMany({ where: { id: event.userId }, data: { guildsDirty: true } });
        }
      } else {
        if (event.kind === 'guild_available') {
          // A period without guild visibility may have hidden a legitimate rejoin.
          // The new guild revision still requires OAuth before any access grant.
          await tx.guildAccessRemoval.deleteMany({ where: { guildId: event.guildId } });
        }
        const installed =
          event.kind === 'guild_remove'
            ? 'not_installed'
            : event.kind === 'guild_unavailable'
              ? 'unknown'
              : event.kind === 'guild_available'
                ? 'installed'
                : undefined;
        const available =
          event.kind === 'guild_available'
            ? true
            : ['guild_remove', 'guild_unavailable'].includes(event.kind)
              ? false
              : undefined;
        await tx.guildAccessObservation.upsert({
          where: { guildId: event.guildId! },
          create: {
            guildId: event.guildId!,
            revision: 1,
            ...(installed ? { installed } : {}),
            ...(available !== undefined ? { available } : {}),
          },
          update: {
            revision: { increment: 1 },
            ...(installed ? { installed } : {}),
            ...(available !== undefined ? { available } : {}),
          },
        });
      }
      await tx.guildAccessControl.update({
        where: { id: CONTROL_ID },
        data: { lastSequence: event.sequence, revision: { increment: 1 } },
      });
      return { sequence: event.sequence };
    });
  }

  async installation(guildId: string) {
    const [control, observation] = await Promise.all([
      this.prisma.guildAccessControl.findUnique({ where: { id: CONTROL_ID } }),
      this.prisma.guildAccessObservation.findUnique({ where: { guildId } }),
    ]);
    return this.live(control) && observation
      ? (observation.installed as 'installed' | 'not_installed' | 'unknown')
      : undefined;
  }
}
