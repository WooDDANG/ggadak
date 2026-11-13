import { GuildAccessPolicy, type GuildAccessEvent } from '@ggaddak/shared';
import type {
  GuildAccessControl,
  GuildAccessObservation,
  Membership,
  Prisma,
} from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import type { DiscordGuild } from '../adapters/discord-auth.adapter.js';
import {
  GuildAccessRepository,
  type VerifiedMembership,
} from '../repositories/guild-access.repository.js';

/** Gateway observations revoke cached proofs; OAuth remains the authority for grants. */
export class GuildAccessService {
  private lease?: { streamId: string; until: number };
  private epoch = 0;
  private invalidStream?: string;
  cacheEpoch() {
    return this.epoch;
  }
  constructor(
    private repo: GuildAccessRepository,
    private now: () => number = Date.now,
  ) {}

  initialize() {
    return this.repo.initialize();
  }

  private live(control: GuildAccessControl) {
    return Boolean(
      control.connected &&
      this.lease?.streamId === control.streamId &&
      this.lease.until > this.now(),
    );
  }

  private covered(control: GuildAccessControl, observation: GuildAccessObservation | null) {
    return (
      this.live(control) &&
      Boolean(
        control.membersIntent && observation?.available && observation.installed === 'installed',
      )
    );
  }

  async revision() {
    return (await this.repo.control()).revision;
  }

  async eventCoverage(): Promise<
    'trusted' | 'members_intent_disabled' | 'disconnected' | 'expired' | 'unknown'
  > {
    const control = await this.repo.control();
    if (!control.connected || control.streamId === null) return 'disconnected';
    if (!this.live(control)) return 'expired';
    if (!control.membersIntent) return 'members_intent_disabled';
    return 'trusted';
  }

  async installationInventory() {
    const before = await this.repo.control();
    if (!this.live(before)) return null;
    const observations = await this.repo.observations();
    const after = await this.repo.control();
    if (
      !this.live(after) ||
      before.revision !== after.revision ||
      before.streamId !== after.streamId
    )
      return null;
    return new Map(observations.map(observation => [observation.guildId, observation.installed]));
  }

  async trusted(membership: Membership) {
    const [control, observation] = await Promise.all([
      this.repo.control(),
      this.repo.observation(membership.guildId),
    ]);
    return this.covered(control, observation) && membership.guildRevision === observation?.revision;
  }

  async removed(userId: string, guildId: string) {
    const [removal, control, observation] = await Promise.all([
      this.repo.removal(userId, guildId),
      this.repo.control(),
      this.repo.observation(guildId),
    ]);
    return Boolean(removal && this.covered(control, observation));
  }

  async snapshotTrusted(userId: string) {
    const { user, memberships } = await this.repo.userSnapshot(userId);
    if (!user || user.guildsDirty || !memberships.length) return false;
    const control = await this.repo.control();
    if (!this.live(control) || !control.membersIntent) return false;
    const checks = await Promise.all(
      memberships.map(async m => {
        const observation = await this.repo.observation(m.guildId);
        if (observation?.installed !== 'installed') return true;
        return this.covered(control, observation) && m.guildRevision === observation.revision;
      }),
    );
    return checks.every(Boolean);
  }

  async replaceMemberships(
    tx: Prisma.TransactionClient,
    userId: string,
    guilds: DiscordGuild[],
    revision: number,
  ) {
    const control = await this.repo.control(tx);
    if (control.revision !== revision)
      throw new AppError('Discord permissions changed during verification; retry shortly', 503);
    const memberships: VerifiedMembership[] = [];
    for (const guild of guilds) {
      const observation = await this.repo.observation(guild.id, tx);
      const removal = await this.repo.removal(userId, guild.id, tx);
      if (removal && this.covered(control, observation)) continue;
      memberships.push({
        guild: { id: guild.id, name: guild.name, icon: guild.icon },
        owner: guild.owner,
        permissions: guild.permissions,
        guildRevision: observation?.revision ?? -1,
      });
    }
    await this.repo.replaceMemberships(userId, memberships, new Date(this.now()), tx);
  }

  async observe(event: GuildAccessEvent) {
    const leaseUntil = new Date(this.now() + GuildAccessPolicy.leaseMs);
    if (event.kind === 'heartbeat') {
      const control = await this.repo.control();
      if (control.streamId !== event.streamId || this.invalidStream === event.streamId)
        throw new AppError('Gateway stream must reset before delivering events', 409);
      if (event.sequence !== control.lastSequence) {
        this.lease = undefined;
        this.epoch++;
        this.invalidStream = event.streamId;
        return { sequence: control.lastSequence, resetRequired: true };
      }
      if (event.connected !== true) this.epoch++;
      this.lease =
        event.connected === true
          ? { streamId: event.streamId, until: leaseUntil.getTime() }
          : undefined;
      return { sequence: control.lastSequence };
    }
    const result = await this.repo.withTransaction(async tx => {
      const control = await this.repo.control(tx);
      if (event.kind === 'reset') {
        if (this.invalidStream === event.streamId)
          throw new AppError('Gateway stream must use a new identifier', 409);
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
          return { sequence: 0 };
        }
        if (control.streamId && this.live(control))
          throw new AppError('Another Gateway stream is active', 409);
        await this.repo.resetObservations(
          [...new Set(event.guildIds)].map(guildId => {
            const unavailable = event.unavailableGuildIds?.includes(guildId) ?? false;
            return {
              guildId,
              installed: unavailable ? ('unknown' as const) : ('installed' as const),
              available: !unavailable,
            };
          }),
          tx,
        );
        await this.repo.updateControl(
          {
            streamId: event.streamId,
            lastSequence: 0,
            connected: true,
            membersIntent: event.membersIntent,
            leaseUntil,
            advanceRevision: true,
          },
          tx,
        );
        return { sequence: 0 };
      }
      if (control.streamId !== event.streamId)
        throw new AppError('Gateway stream must reset before delivering events', 409);
      if (event.sequence <= control.lastSequence) return { sequence: control.lastSequence };
      if (event.sequence !== control.lastSequence + 1) {
        await this.repo.updateControl(
          { streamId: null, connected: false, leaseUntil: null, advanceRevision: true },
          tx,
        );
        return { sequence: control.lastSequence, resetRequired: true };
      }
      if (event.kind !== 'disconnect' && !event.guildId)
        throw new AppError('Guild ID is required', 400);
      if (event.kind.startsWith('member_') && !event.userId)
        throw new AppError('User ID is required', 400);
      if (event.kind === 'disconnect') {
        await this.repo.updateControl({ connected: false, leaseUntil: null }, tx);
      } else if (event.kind === 'member_remove') {
        await this.repo.removeMember(event.userId!, event.guildId!, tx);
      } else if (event.kind === 'member_change' || event.kind === 'member_join') {
        await this.repo.invalidateMember(event.userId!, event.guildId!, tx);
        if (event.kind === 'member_join') {
          await this.repo.clearRemovals(event.guildId!, event.userId, tx);
          await this.repo.markGuildsDirty(event.userId!, tx);
        }
      } else {
        if (event.kind === 'guild_available') {
          // Visibility gaps may hide rejoins; the new revision still requires OAuth before grants.
          await this.repo.clearRemovals(event.guildId!, undefined, tx);
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
        await this.repo.invalidateGuild(event.guildId!, installed, available, tx);
      }
      await this.repo.updateControl({ lastSequence: event.sequence, advanceRevision: true }, tx);
      return { sequence: event.sequence };
    });
    if (event.kind === 'reset' && !('resetRequired' in result)) {
      this.lease = { streamId: event.streamId, until: leaseUntil.getTime() };
      this.invalidStream = undefined;
    }
    if (event.kind === 'disconnect' || ('resetRequired' in result && result.resetRequired))
      this.lease = undefined;
    if (event.kind === 'disconnect' || ('resetRequired' in result && result.resetRequired)) {
      this.epoch++;
      this.invalidStream = event.streamId;
    }
    return result;
  }

  async installation(guildId: string) {
    const [control, observation] = await Promise.all([
      this.repo.control(),
      this.repo.observation(guildId),
    ]);
    return this.live(control) && observation
      ? (observation.installed as 'installed' | 'not_installed' | 'unknown')
      : undefined;
  }
}
