import { test, expect } from 'vitest';
import { DecisionSchema } from '@ggaddak/shared';
import { PrismaClient } from '@prisma/client';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { DecisionRepository } from '../src/repositories/decision.repository.js';
import { SearchService, EmbeddingProvider } from '../src/services/search.service.js';

const provider: EmbeddingProvider = {
  model: 'fixture-v1',
  async embed(text) {
    // Fixed semantic oracle: latency questions and Redis evidence share a vector without shared words.
    return text.includes('빠르게') || text.includes('Redis') ? [1, 0] : [0, 1];
  },
};

test('Why retrieves related Rationale and sources only from confirmed guild records, with persisted vectors after restart', async () => {
  const db = await isolatedRepository();
  let restarted: PrismaClient | undefined;
  try {
    for (const [id, guildId, state, decision] of [
      ['cache', 'guild-1', 'Decided', 'Redis'],
      ['unrelated', 'guild-1', 'Decided', 'Email'],
      ['private', 'guild-2', 'Decided', 'Redis'],
      ['draft', 'guild-1', 'Draft', 'Redis'],
    ])
      await db.repo.saveDecision(
        DecisionSchema.parse({
          id,
          topic: decision,
          decision,
          rationale: 'Reduce latency',
          state,
          source: {
            guildId,
            channelId: 'c',
            triggerMessageId: 'm',
            participants: [],
            messageUrl: `https://discord.com/channels/${guildId}/c/m`,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      );
    const service = new SearchService(db.repo, provider);
    const results = await service.search('guild-1', '빠르게 응답하는 이유?', 1);
    expect(results.items.length).toBe(1);
    expect(results.items[0].decision.id).toBe('cache');
    expect(results.items[0].score).toBe(1);
    expect(results.items[0].excerpt.includes('Reduce latency')).toBeTruthy();
    expect(results.items[0].sourceUrl).toBe('https://discord.com/channels/guild-1/c/m');
    await db.client.$disconnect();
    restarted = new PrismaClient({ datasources: { db: { url: db.url } } });
    let calls = 0;
    const after = new SearchService(new DecisionRepository(restarted), {
      ...provider,
      async embed(text) {
        calls++;
        return provider.embed(text);
      },
    });
    expect((await after.search('guild-1', '빠르게', 1)).items[0].decision.id).toBe('cache');
    expect(calls, 'restart reuses stored document vectors; only query needs embedding').toBe(1);
  } finally {
    await restarted?.$disconnect();
    await db.cleanup();
  }
});

import { createServer } from '../src/server.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';

test('Why HTTP enforces authentication, guild access and input bounds and retries failed indexing after edits', async () => {
  const db = await isolatedRepository();
  let fail = false;
  const embeddingProvider = {
    ...provider,
    async embed(text: string) {
      if (fail) throw new Error('offline');
      return provider.embed(text);
    },
  };
  const server = await createServer(db.repo, undefined, fakeAuthOptions(), embeddingProvider);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const base = `http://localhost:${(server.address() as any).port}`;
  try {
    await db.repo.saveDecision(
      DecisionSchema.parse({
        id: 'd',
        topic: 'Redis',
        decision: 'Redis',
        rationale: 'Latency',
        state: 'Decided',
        source: { guildId: 'guild-1', channelId: 'c', triggerMessageId: 'm', participants: [] },
        createdAt: '2026-01-01T00:00:00Z',
      }),
    );
    expect((await fetch(`${base}/api/v1/search?guildId=guild-1&query=빠르게`)).status).toBe(401);
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}` };
    expect(
      (await fetch(`${base}/api/v1/search?guildId=forbidden&query=빠르게`, { headers })).status,
    ).toBe(403);
    expect(
      (await fetch(`${base}/api/v1/search?guildId=guild-1&query=빠르게&limit=0`, { headers }))
        .status,
    ).toBe(400);
    expect(
      (await fetch(`${base}/api/v1/search?guildId=guild-1&query=%20`, { headers })).status,
    ).toBe(400);
    const url = `${base}/api/v1/search?guildId=guild-1&query=빠르게`;
    expect((await fetch(url, { headers })).status).toBe(200);
    const d = (await db.repo.getDecisionById('d'))!;
    await db.repo.saveDecision({ ...d, rationale: 'Updated source rationale' });
    fail = true;
    expect((await fetch(url, { headers })).status).toBe(503);
    fail = false;
    const response = await fetch(url, { headers });
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).data.items[0].excerpt).toBe('Updated source rationale');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});

test('review confirmation indexes a candidate, document-provider failure survives restart and retries, and discarded records stay hidden', async () => {
  const db = await isolatedRepository();
  let restarted: PrismaClient | undefined;
  try {
    await db.repo.saveDecision(
      DecisionSchema.parse({
        id: 'review',
        topic: 'Redis',
        decision: 'Redis',
        rationale: 'Latency',
        state: 'Draft',
        source: { guildId: 'guild-1', channelId: 'c', triggerMessageId: 'm', participants: [] },
        createdAt: '2026-01-01T00:00:00Z',
      }),
    );
    const service = new SearchService(db.repo, provider);
    expect((await service.search('guild-1', '빠르게')).items.length).toBe(0);
    await db.repo.reviewDecision('review', 'confirm', { expectedVersion: 1, approvedBy: 'Lee' });
    expect((await service.search('guild-1', '빠르게')).items[0].decision.status).toBe('CONFIRMED');
    const updated = (await db.repo.getDecisionById('review'))!;
    await db.repo.saveDecision({ ...updated, rationale: 'Changed Rationale' });
    const failing = new SearchService(db.repo, {
      ...provider,
      async embed(text) {
        if (text.includes('Changed')) throw new Error('provider outage');
        return provider.embed(text);
      },
    });
    await expect((() => failing.search('guild-1', '빠르게'))()).rejects.toThrow(
      /Embedding provider unavailable/,
    );
    await db.client.$disconnect();
    restarted = new PrismaClient({ datasources: { db: { url: db.url } } });
    const retry = new SearchService(new DecisionRepository(restarted), provider);
    expect((await retry.backfill('guild-1')).indexed).toBe(1);
    expect((await retry.search('guild-1', '빠르게')).items[0].excerpt).toBe('Changed Rationale');
    // Public Prisma storage boundary represents an imported discarded decision.
    await restarted.decision.update({
      where: { id: 'review' },
      data: {
        status: 'Rejected',
        lifecycle: 'DISCARDED',
        domainJson: JSON.stringify({ ...updated, state: 'Rejected' }),
      },
    });
    expect((await retry.search('guild-1', '빠르게')).items.length).toBe(0);
  } finally {
    await restarted?.$disconnect();
    await db.cleanup();
  }
});
