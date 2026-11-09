import type { PrismaClient } from '@prisma/client';
import { DeliveryPolicy } from '@ggaddak/shared';

/** Read-only readiness observations; never call Discord from a health probe. */
export class HealthService {
  private pending?: Promise<
    [
      Awaited<ReturnType<PrismaClient['analysisDeliveryHeartbeat']['findUnique']>>,
      Awaited<ReturnType<PrismaClient['guildAccessControl']['findUnique']>>,
    ]
  >;
  constructor(
    private prisma: PrismaClient,
    private now: () => number = Date.now,
  ) {}

  async check() {
    const checkedAt = new Date(this.now()).toISOString();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!this.pending) {
        const pending = Promise.all([
          this.prisma.analysisDeliveryHeartbeat.findUnique({ where: { id: 'bot' } }),
          this.prisma.guildAccessControl.findUnique({ where: { id: 'discord' } }),
        ]);
        this.pending = pending;
        void pending
          .finally(() => {
            if (this.pending === pending) this.pending = undefined;
          })
          .catch(() => {});
      }
      const [heartbeat, gateway] = await Promise.race([
        this.pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Health query timed out')), 2000);
        }),
      ]);
      const bot = Boolean(
        heartbeat &&
        this.now() - heartbeat.synchronizedAt.getTime() < DeliveryPolicy.statusFreshnessMs,
      );
      const discord = Boolean(
        gateway?.streamId &&
        gateway.connected &&
        gateway.leaseUntil &&
        gateway.leaseUntil.getTime() > this.now(),
      );
      return {
        status: bot && discord ? 'healthy' : 'degraded',
        ready: bot && discord,
        checkedAt,
        checks: { database: true, bot, discord, membersIntent: Boolean(gateway?.membersIntent) },
      };
    } catch {
      return {
        status: 'degraded',
        ready: false,
        checkedAt,
        checks: { database: false, bot: null, discord: null, membersIntent: null },
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
