import type { Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

const CONTROL_ID = 'discord';
type Store = Prisma.TransactionClient;
type Installation = 'installed' | 'not_installed' | 'unknown';

export interface VerifiedMembership {
  guild: { id: string; name: string; icon: string | null };
  owner: boolean;
  permissions: string;
  guildRevision: number;
}

export interface AccessStreamUpdate {
  streamId?: string | null;
  lastSequence?: number;
  connected?: boolean;
  membersIntent?: boolean;
  leaseUntil?: Date | null;
  advanceRevision?: boolean;
}

/** Atomic storage operations; authorization and ordering decisions live in the service. */
export class GuildAccessRepository extends BaseRepository {
  async initialize() {
    await this.withTransaction(async tx => {
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

  control(tx: Store = this.prisma) {
    return tx.guildAccessControl.findUniqueOrThrow({ where: { id: CONTROL_ID } });
  }

  observation(guildId: string, tx: Store = this.prisma) {
    return tx.guildAccessObservation.findUnique({ where: { guildId } });
  }

  observations() {
    return this.prisma.guildAccessObservation.findMany();
  }

  removal(userId: string, guildId: string, tx: Store = this.prisma) {
    return tx.guildAccessRemoval.findUnique({ where: { guildId_userId: { guildId, userId } } });
  }

  async userSnapshot(userId: string) {
    const [user, memberships] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.membership.findMany({ where: { userId } }),
    ]);
    return { user, memberships };
  }

  updateControl(update: AccessStreamUpdate, tx: Store) {
    const { advanceRevision, ...data } = update;
    return tx.guildAccessControl.update({
      where: { id: CONTROL_ID },
      data: {
        ...data,
        ...(advanceRevision ? { revision: { increment: 1 } } : {}),
      },
    });
  }

  async resetObservations(
    observations: Array<{ guildId: string; installed: Installation; available: boolean }>,
    tx: Store,
  ) {
    await tx.guildAccessObservation.updateMany({
      data: { installed: 'not_installed', available: false, revision: { increment: 1 } },
    });
    for (const { guildId, ...data } of observations) {
      await tx.guildAccessObservation.upsert({
        where: { guildId },
        create: { guildId, revision: 1, ...data },
        update: data,
      });
    }
    await tx.guildAccessRemoval.deleteMany();
  }

  invalidateGuild(
    guildId: string,
    installed: Installation | undefined,
    available: boolean | undefined,
    tx: Store,
  ) {
    const data = {
      ...(installed ? { installed } : {}),
      ...(available !== undefined ? { available } : {}),
    };
    return tx.guildAccessObservation.upsert({
      where: { guildId },
      create: { guildId, revision: 1, ...data },
      update: { revision: { increment: 1 }, ...data },
    });
  }

  async removeMember(userId: string, guildId: string, tx: Store) {
    await tx.guildAccessRemoval.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId },
      update: {},
    });
    await tx.membership.deleteMany({ where: { userId, guildId } });
  }

  invalidateMember(userId: string, guildId: string, tx: Store) {
    return tx.membership.updateMany({ where: { userId, guildId }, data: { guildRevision: -1 } });
  }

  clearRemovals(guildId: string, userId: string | undefined, tx: Store) {
    return tx.guildAccessRemoval.deleteMany({ where: { guildId, ...(userId ? { userId } : {}) } });
  }

  markGuildsDirty(userId: string, tx: Store) {
    return tx.user.updateMany({ where: { id: userId }, data: { guildsDirty: true } });
  }

  async replaceMemberships(
    userId: string,
    memberships: VerifiedMembership[],
    refreshedAt: Date,
    tx: Store,
  ) {
    await tx.membership.deleteMany({ where: { userId } });
    for (const { guild, ...membership } of memberships) {
      await tx.guild.upsert({
        where: { id: guild.id },
        create: guild,
        update: { name: guild.name, icon: guild.icon },
      });
      await tx.membership.create({
        data: { userId, guildId: guild.id, refreshedAt, ...membership },
      });
    }
    await tx.guildAccessRemoval.deleteMany({
      where: { userId, guildId: { in: memberships.map(m => m.guild.id) } },
    });
    await tx.user.update({ where: { id: userId }, data: { guildsDirty: false } });
  }
}
