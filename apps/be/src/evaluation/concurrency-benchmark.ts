import 'reflect-metadata';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import config from '../config/index.js';
import { AnalysisPolicy } from '@ggaddak/shared';
import { AiAdapter } from '../adapters/ai.adapter.js';
import { AgyProvider } from '../adapters/agy-provider.js';
import type { AiProvider } from '../adapters/ai-provider.js';
import { VerificationSchema } from '../domain/decision-graph.js';
import type { AnalyzeDiscussionParams } from '../domain/analysis.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';
import { DiscussionService } from '../services/discussion.service.js';
import { AiCallScheduler } from '../services/ai-call-scheduler.js';
import { isolatedRepository } from '../repositories/test-database.js';
import { budgetProvider, type EvaluationBudget } from './runner.js';

const execute = promisify(execFile);
export const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};
export interface BenchmarkThresholds {
  maxP95Ms: number;
  maxErrorRate: number;
  maxRssMiB: number;
  maxCpuPercent: number;
  maxDbP95Ms: number;
  maxProbeP95Ms: number;
}
export interface BenchmarkSample {
  n: number;
  completedPerMinute: number;
  p95Ms: number | null;
  errorRate: number;
  peakRssMiB: number;
  peakCpuPercent: number;
  dbP95Ms: number | null;
  probeP95Ms: number | null;
  resourceSamplesAvailable: boolean;
}

/** Smallest measured N within 5% of the best throughput that satisfies all budgets. */
export function selectConcurrency(
  samples: BenchmarkSample[],
  thresholds: BenchmarkThresholds,
  requireProbe = false,
) {
  const eligible = samples.filter(
    s =>
      s.resourceSamplesAvailable &&
      s.completedPerMinute > 0 &&
      s.p95Ms !== null &&
      s.p95Ms <= thresholds.maxP95Ms &&
      s.errorRate <= thresholds.maxErrorRate &&
      s.peakRssMiB <= thresholds.maxRssMiB &&
      s.peakCpuPercent <= thresholds.maxCpuPercent &&
      s.dbP95Ms !== null &&
      s.dbP95Ms <= thresholds.maxDbP95Ms &&
      (!requireProbe || (s.probeP95Ms !== null && s.probeP95Ms <= thresholds.maxProbeP95Ms)),
  );
  const best = Math.max(...eligible.map(s => s.completedPerMinute), 0);
  return (
    eligible.filter(s => s.completedPerMinute >= best * 0.95).sort((a, b) => a.n - b.n)[0]?.n ??
    null
  );
}

async function processTreeUsage() {
  const { stdout } = await execute('ps', ['-A', '-o', 'pid=,ppid=,rss=,%cpu='], {
    timeout: 2000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const rows = stdout
    .trim()
    .split('\n')
    .map(line => line.trim().split(/\s+/).map(Number));
  const ids = new Set([process.pid]);
  for (let size = 0; size !== ids.size;) {
    size = ids.size;
    for (const [pid, parent] of rows) if (ids.has(parent)) ids.add(pid);
  }
  return rows
    .filter(([pid]) => ids.has(pid))
    .reduce(
      (total, [, , rss, cpu]) => ({
        rss: total.rss + rss / 1024,
        cpu: total.cpu + cpu,
      }),
      { rss: 0, cpu: 0 },
    );
}

export interface BenchmarkOptions {
  ns: number[];
  rounds: number;
  records: AnalyzeDiscussionParams[];
  model: string;
  live: boolean;
  budget: EvaluationBudget;
  maxDurationMs: number;
  thresholds: BenchmarkThresholds;
  probeUrl?: string;
  environment: string;
}

export async function runConcurrencyBenchmark(options: BenchmarkOptions) {
  if (
    !options.ns.length ||
    options.ns.some(n => !Number.isSafeInteger(n) || n < 1 || n > AnalysisPolicy.maxConcurrency)
  )
    throw new Error('Invalid N candidates');
  if (!Number.isSafeInteger(options.rounds) || options.rounds < 1 || !options.records.length)
    throw new Error('Rounds and input records must be nonempty');
  if (!Number.isSafeInteger(options.maxDurationMs) || options.maxDurationMs < 1)
    throw new Error('Invalid benchmark duration');
  for (const [key, value] of Object.entries(options.thresholds))
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid threshold: ' + key);
  if (options.live) {
    if (!options.probeUrl) throw new Error('Live benchmark requires a service probe URL');
    try {
      const response = await fetch(options.probeUrl, {
        signal: AbortSignal.timeout(3000),
        headers: process.env.BENCHMARK_COOKIE ? { Cookie: process.env.BENCHMARK_COOKIE } : {},
      });
      await response.arrayBuffer();
      if (!response.ok) throw new Error('Probe response not successful');
    } catch {
      throw new Error('Live benchmark service probe unavailable; no AGY calls started');
    }
  }
  const deadline = AbortSignal.timeout(options.maxDurationMs);
  const bounded = budgetProvider(
    options.budget,
    new AgyProvider({ executable: config.ai.agyExecutable }),
  );
  const shared = options.live ? new PrismaClient() : undefined;
  const keys = ['AI_CALL_CONCURRENCY', 'AI_SESSION_CONCURRENCY', 'ANALYSIS_CONCURRENCY'] as const;
  const previous = keys.map(key => process.env[key]);
  const samples = [];
  try {
    for (const n of [...new Set([1, ...options.ns])].sort((a, b) => a - b)) {
      if (deadline.aborted) break;
      process.env.AI_CALL_CONCURRENCY = String(n);
      process.env.AI_SESSION_CONCURRENCY = String(n);
      process.env.ANALYSIS_CONCURRENCY = String(
        Math.min(options.records.length, AnalysisPolicy.maxConcurrency),
      );
      const db = await isolatedRepository();
      const scheduler = new AiCallScheduler(shared ?? db.client, n);
      const verifyCounts = new Map<string, number>();
      let active = 0,
        peakCalls = 0;
      const provider: AiProvider = options.live
        ? bounded.provider
        : {
            async generate(request) {
              active++;
              peakCalls = Math.max(peakCalls, active);
              try {
                await delay(Math.min(150, 20 + request.input.length / 80), undefined, {
                  signal: request.signal,
                });
                const transcript = (JSON.parse(request.input) as { transcript: string }).transcript;
                const verify = request.outputSchema === VerificationSchema;
                const count = verifyCounts.get(transcript) ?? 0;
                if (verify) verifyCounts.set(transcript, count + 1);
                return {
                  value: verify
                    ? transcript.includes('repair-needed') && count === 0
                      ? {
                          valid: false,
                          issues: [
                            { message: 'Fixture correction requested', nodeIds: [], edgeIds: [] },
                          ],
                        }
                      : { valid: true, issues: [] }
                    : { summary: 'Fixture context', nodes: [], edges: [], discussionProblems: [] },
                  usage: { inputTokens: 10, outputTokens: 5 },
                };
              } finally {
                active--;
              }
            },
          };
      const ai = new AiAdapter({ provider: 'agy', model: options.model }, 'production', provider);
      ai.settings.maxOutputTokens = options.budget.maxOutputTokens;
      const service = new DiscussionService(db.repo, ai, new DecisionExtractorCore(), scheduler);
      let writes = 0,
        dbErrors = 0,
        peakRssMiB = 0,
        peakCpuPercent = 0,
        resourceSamplesAvailable = false;
      const readTimes: number[] = [],
        probeTimes: number[] = [],
        durations: number[] = [],
        activeDurations: number[] = [],
        waits: number[] = [],
        failures: string[] = [];
      let completed = 0,
        total = 0,
        stop = false;
      db.client.$use(async (params, next) => {
        if (/create|update|upsert|delete|executeRaw/i.test(params.action)) writes++;
        try {
          return await next(params);
        } catch (error) {
          dbErrors++;
          throw error;
        }
      });
      const measure = async () => {
        do {
          try {
            const resource = await processTreeUsage();
            peakRssMiB = Math.max(peakRssMiB, resource.rss);
            peakCpuPercent = Math.max(peakCpuPercent, resource.cpu);
            resourceSamplesAvailable = true;
          } catch {
            /* Report missing resource visibility instead of inventing measurements. */
          }
          const started = performance.now();
          try {
            await db.client.decision.count();
            readTimes.push(performance.now() - started);
          } catch {
            dbErrors++;
          }
          if (options.probeUrl) {
            const probeStarted = performance.now();
            try {
              const response = await fetch(options.probeUrl, {
                signal: AbortSignal.timeout(3000),
                headers: process.env.BENCHMARK_COOKIE
                  ? { Cookie: process.env.BENCHMARK_COOKIE }
                  : {},
              });
              await response.arrayBuffer();
              if (!response.ok) throw new Error('Probe response not successful');
              probeTimes.push(performance.now() - probeStarted);
            } catch {
              failures.push('probe');
            }
          }
          if (!stop) await delay(50);
        } while (!stop);
      };
      const monitoring = measure();
      const started = performance.now();
      try {
        for (let round = 0; round < options.rounds && !deadline.aborted; round++) {
          await Promise.all(
            options.records.map(async (record, index) => {
              const request = {
                ...structuredClone(record),
                requestId: `benchmark-${n}-${round}-${index}`,
              };
              const admittedAt = performance.now();
              let finished = false;
              try {
                await service.analyzeDiscussion(request, { signal: deadline });
                finished = true;
              } catch (error) {
                failures.push(error instanceof Error ? error.message : 'analysis');
              }
              // Completion includes worker/permit queues, checkpoints, projection and commit.
              if (finished) durations.push(performance.now() - admittedAt);
              const status = await service
                .getStatus(request.requestId, request.guildId ?? 'discord')
                .catch(() => null);
              for (const session of status?.sessions ?? []) {
                total++;
                if (session.phase === 'done') {
                  completed++;
                  activeDurations.push(session.elapsedMs);
                  waits.push(session.waitMs ?? 0);
                }
              }
            }),
          );
        }
      } finally {
        stop = true;
        await monitoring;
        await db.cleanup();
      }
      const elapsedMs = performance.now() - started;
      samples.push({
        n,
        sessionWorkers: n,
        globalCallLimit: n,
        completed,
        total,
        elapsedMs,
        completedPerMinute: (completed * 60000) / elapsedMs,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        activeStageP95Ms: percentile(activeDurations, 0.95),
        waitP50Ms: percentile(waits, 0.5),
        waitP95Ms: percentile(waits, 0.95),
        errorRate: total ? (total - completed) / total : 1,
        peakCalls: options.live ? null : peakCalls,
        peakRssMiB,
        peakCpuPercent,
        resourceSamplesAvailable,
        dbP95Ms: percentile(readTimes, 0.95),
        probeP95Ms: percentile(probeTimes, 0.95),
        writes,
        dbErrors,
        failures,
      });
    }
    const successful = samples.filter(
      sample => sample.dbErrors === 0 && sample.failures.length === 0,
    );
    const suggestedN = selectConcurrency(successful, options.thresholds, options.live);
    return {
      mode: options.live ? 'live-agy' : 'offline-fixture',
      model: options.model,
      environment: options.environment,
      inputSha256: createHash('sha256').update(JSON.stringify(options.records)).digest('hex'),
      thresholds: options.thresholds,
      budget: options.budget,
      consumption: bounded.usage(),
      deadlineExceeded: deadline.aborted,
      samples,
      suggestedN,
      productionRecommendation: options.live && !deadline.aborted ? suggestedN : null,
      limitation:
        'Only measured N values are compared. Fixture results do not establish AGY account capacity; live recommendation requires successful external latency probes and process-tree resource samples.',
    };
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
    await shared?.$disconnect();
  }
}

async function main() {
  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    if (args.has(key)) throw new Error('Duplicate argument: ' + key);
    args.set(key, key === '--live' ? 'true' : (process.argv[++i] ?? ''));
  }
  const live = args.has('--live');
  const number = (name: string, fallback?: number) => {
    const value = Number(args.get(name) ?? fallback);
    if (!Number.isFinite(value) || value < 0)
      throw new Error('Explicit numeric value required: ' + name);
    return value;
  };
  if (!args.get('--output')) throw new Error('--output required');
  if (live && (!args.get('--input') || !args.get('--model') || !args.get('--environment')))
    throw new Error('Live benchmark requires --input, --model and --environment');
  const records: AnalyzeDiscussionParams[] = args.get('--input')
    ? JSON.parse(await readFile(resolve(invocationRoot, args.get('--input')!), 'utf8'))
    : Array.from({ length: 2 }, (_, request) => ({
        requestId: 'fixture',
        guildId: 'benchmark',
        channelId: 'channel-' + request,
        isManualOverride: true,
        rawMessages: Array.from({ length: 6 }, (_, index) => ({
          id: String(100 + request * 10 + index),
          author: 'Fixture',
          content:
            `${index === 2 ? 'repair-needed ' : ''}데이터베이스 도입과 기술 선택을 논의합니다. `.repeat(
              index % 2 ? 40 : 1,
            ),
          createdAt: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
        })),
      }));
  const budget = {
    maxCalls: number('--max-calls', live ? undefined : 0),
    maxTokens: number('--max-tokens', live ? undefined : 0),
    maxOutputTokens: number('--max-output-tokens', live ? undefined : 8192),
  };
  if (live && Object.values(budget).some(value => !Number.isSafeInteger(value) || value <= 0))
    throw new Error('Live budgets must be explicit positive integers');
  const result = await runConcurrencyBenchmark({
    ns: (args.get('--ns') ?? '1,2,4').split(',').map(Number),
    rounds: number('--rounds', 3),
    records,
    model: args.get('--model') ?? 'fixture',
    live,
    budget,
    maxDurationMs: number('--max-duration-ms', live ? undefined : 60000),
    environment: args.get('--environment') ?? 'local-fixture',
    probeUrl: args.get('--probe-url'),
    thresholds: {
      maxP95Ms: number('--max-p95-ms', 180000),
      maxErrorRate: number('--max-error-rate', 0),
      maxRssMiB: number('--max-rss-mib', 1024),
      maxCpuPercent: number('--max-cpu-percent', 200),
      maxDbP95Ms: number('--max-db-p95-ms', 100),
      maxProbeP95Ms: number('--max-probe-p95-ms', 200),
    },
  });
  const output = resolve(invocationRoot, args.get('--output')!);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      output,
      suggestedN: result.suggestedN,
      productionRecommendation: result.productionRecommendation,
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Benchmark failed');
    process.exitCode = 1;
  });
