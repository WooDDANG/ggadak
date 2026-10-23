import 'reflect-metadata';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { PrismaClient } from '@prisma/client';
import { AiCallScheduler } from '../services/ai-call-scheduler.js';
import {
  AiAdapter,
  type IAiAdapter,
  type AiCallContext,
  type AiResult,
} from '../adapters/ai.adapter.js';
import { AgyProvider } from '../adapters/agy-provider.js';
import type { AiProvider, AiProviderRequest } from '../adapters/ai-provider.js';
import config from '../config/index.js';
import { DiscussionService } from '../services/discussion.service.js';
import { prepareAnalysis } from '../services/discussion-preprocessing.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';
import { isolatedRepository } from '../repositories/test-database.js';
import { GraphSchema, graphIssues, VerificationSchema } from '../domain/decision-graph.js';
import { ExtractionResultSchema } from './baseline/schemas.js';
import { EXTRACTION_SYSTEM_PROMPT } from './baseline/prompt.js';
import type { AnalyzeDiscussionParams } from '../domain/analysis.js';

export interface EvaluationInput {
  meetingId: string;
  split: string;
  language: string;
  input: {
    utterances: { id: string; speaker: string; text: string; startSeconds: number | null }[];
  };
}
export interface EvaluationFixture {
  baseline: unknown[];
  extract: unknown[];
  verify: unknown[];
  repair: unknown[];
}
export interface EvaluationBudget {
  maxCalls: number;
  maxTokens: number;
  maxOutputTokens: number;
}

/** Reserve a conservative budget before each CLI call, then reconcile reported token usage. */
export function budgetProvider(
  budget: EvaluationBudget,
  underlying: AiProvider,
): {
  provider: AiProvider;
  usage: () => { calls: number; tokens: number };
} {
  let calls = 0,
    tokens = 0;
  const provider: AiProvider = {
    async generate(request: AiProviderRequest) {
      const reservation =
        Buffer.byteLength(
          request.system + request.input + JSON.stringify(zodToJsonSchema(request.outputSchema)),
          'utf8',
        ) + request.maxOutputTokens;
      if (calls >= budget.maxCalls || tokens + reservation > budget.maxTokens)
        throw new Error('Evaluation budget exhausted before provider call');
      calls++;
      tokens += reservation;
      const result = await underlying.generate(request);
      const measured = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
      tokens += measured - reservation;
      return result;
    },
  };
  return { provider, usage: () => ({ calls, tokens }) };
}

function payload(record: EvaluationInput, runId: string): AnalyzeDiscussionParams {
  return {
    requestId: runId,
    guildId: 'evaluation',
    channelId: record.meetingId,
    isManualOverride: true,
    rawMessages: record.input.utterances.map(u => ({
      id: u.id,
      author: u.speaker,
      content: u.text,
      ...(u.startSeconds !== null
        ? { createdAt: new Date(Date.UTC(2000, 0, 1) + u.startSeconds * 1000).toISOString() }
        : {}),
    })),
  };
}

export async function evaluateRecords(
  records: EvaluationInput[],
  adapter: AiAdapter,
  fixtures?: Record<string, EvaluationFixture>,
  baselineProvider: AiProvider = new AgyProvider({ executable: config.ai.agyExecutable }),
  scheduler?: AiCallScheduler,
) {
  const database = await isolatedRepository();
  scheduler ??= new AiCallScheduler(database.client);
  const results: unknown[] = [];
  try {
    for (const record of records) {
      const fixture = fixtures?.[record.meetingId];
      if (fixtures && !fixture) throw new Error('Missing fixture for ' + record.meetingId);
      let extractIndex = 0,
        verifyIndex = 0,
        repairIndex = 0,
        baselineIndex = 0;
      const fixtureResult = (values: unknown[], index: number) => {
        if (index >= values.length) throw new Error('Fixture stage response missing');
        return { value: structuredClone(values[index]) };
      };
      const ai: IAiAdapter = fixture
        ? {
            settings: adapter.settings,
            extractGraph: async () => fixtureResult(fixture.extract, extractIndex++),
            verifyGraph: async () => fixtureResult(fixture.verify, verifyIndex++),
            repairGraph: async () => fixtureResult(fixture.repair, repairIndex++),
          }
        : adapter;
      const params = payload(
        record,
        'eval-' +
          createHash('sha256')
            .update(record.meetingId + JSON.stringify(record.input))
            .digest('hex'),
      );
      const prepared = prepareAnalysis(params, adapter.settings);
      const baselineStarted = Date.now();
      const baselineCandidates: { id: string; summary: string }[] = [];
      let baselineOutcome = 'completed',
        baselineError: string | undefined;
      let baselineCalls = 0,
        baselineInputTokens = 0,
        baselineOutputTokens = 0;
      try {
        for (const session of prepared.sessions) {
          baselineCalls++;
          const context: AiCallContext = {
            settings: adapter.settings,
            signal: new AbortController().signal,
          };
          const response: AiResult = fixture
            ? fixtureResult(fixture.baseline, baselineIndex++)
            : await scheduler.run(context.signal, signal =>
                baselineProvider.generate({
                  model: context.settings.model,
                  system: EXTRACTION_SYSTEM_PROMPT,
                  input: JSON.stringify({ transcript: session.transcript }),
                  outputSchema: ExtractionResultSchema,
                  maxOutputTokens: context.settings.maxOutputTokens,
                  signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
                }),
              );
          baselineInputTokens += response.usage?.inputTokens ?? 0;
          baselineOutputTokens += response.usage?.outputTokens ?? 0;
          const extracted = ExtractionResultSchema.parse(response.value);
          if (extracted.found)
            for (const item of extracted.decisions)
              baselineCandidates.push({
                id: 'baseline-' + baselineCandidates.length,
                summary: item.decisionContent ?? item.decision,
              });
        }
      } catch (error) {
        baselineOutcome = 'failed';
        baselineError = error instanceof Error ? error.message : 'failure';
      }
      if (baselineOutcome !== 'completed') baselineCandidates.length = 0;
      const baseline = {
        outcome: baselineOutcome,
        error: baselineError,
        candidates: baselineCandidates,
        relations: [],
        usage: {
          calls: baselineCalls,
          inputTokens: baselineInputTokens,
          outputTokens: baselineOutputTokens,
          durationMs: Date.now() - baselineStarted,
        },
      };
      const service = new DiscussionService(
        database.repo,
        ai,
        new DecisionExtractorCore(),
        scheduler,
      );
      const started = Date.now();
      let workflow: unknown;
      try {
        await service.analyzeDiscussion(params);
        const graph = await service.getGraph(params.requestId, 'evaluation');
        const status = await service.getStatus(params.requestId, 'evaluation');
        workflow = {
          outcome: 'completed',
          graph,
          candidates: graph.sessions.flatMap(s =>
            s.nodes
              .filter(n => n.type === 'DecisionCandidate' && !n.suppressed)
              .map(n => ({ id: n.id, summary: n.summary })),
          ),
          relations: graph.sessions.flatMap(s => s.edges),
          usage: {
            calls: status.sessions.reduce((n, s) => n + s.attempts, 0),
            inputTokens: status.sessions.reduce((n, s) => n + s.inputTokens, 0),
            outputTokens: status.sessions.reduce((n, s) => n + s.outputTokens, 0),
            repairs: status.sessions.reduce((n, s) => n + s.repairs, 0),
            durationMs: Date.now() - started,
          },
        };
      } catch {
        const status = await service.getStatus(params.requestId, 'evaluation');
        workflow = {
          outcome: 'failed',
          error: status.error,
          candidates: [],
          relations: [],
          usage: { sessions: status.sessions, durationMs: Date.now() - started },
        };
      }
      results.push({
        meetingId: record.meetingId,
        split: record.split,
        language: record.language,
        baseline,
        workflow,
      });
    }
    return results;
  } finally {
    await database.cleanup();
  }
}

function argumentsOf(args: string[]) {
  const parsed = new Map<string, string>();
  const flags = new Set(['--live', '--smoke']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (parsed.has(key)) throw new Error('Duplicate argument: ' + key);
    parsed.set(key, flags.has(key) ? 'true' : (args[++i] ?? ''));
  }
  return parsed;
}

async function main() {
  const args = argumentsOf(process.argv.slice(2));
  const live = args.has('--live'),
    smoke = args.has('--smoke');
  const fixturesPath = args.get('--fixtures');
  if (!live && !fixturesPath)
    throw new Error('Choose --fixtures for offline execution or explicit --live with limits');
  if (live && fixturesPath) throw new Error('Live and fixtures are mutually exclusive');
  if (smoke && !live) throw new Error('Smoke requires explicit live execution');
  const positive = (key: string) => {
    const value = Number(args.get(key));
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('Positive explicit limit required: ' + key);
    return value;
  };
  const budget = live
    ? {
        maxCalls: positive('--max-calls'),
        maxTokens: positive('--max-tokens'),
        maxOutputTokens: positive('--max-output-tokens'),
      }
    : { maxCalls: 0, maxTokens: 0, maxOutputTokens: 8192 };
  if (live && (!args.get('--model') || args.get('--provider') !== 'agy'))
    throw new Error('Explicit AGY provider and model required for live execution');
  const provider = new AgyProvider({ executable: config.ai.agyExecutable });
  const liveDatabase = live ? new PrismaClient() : undefined;
  const scheduler = liveDatabase ? new AiCallScheduler(liveDatabase) : undefined;
  try {
    const bounded = budgetProvider(budget, provider);
    const adapter = new AiAdapter(
      {
        ...config.ai,
        provider: args.get('--provider') ?? 'mock',
        model: args.get('--model') ?? 'fixture',
        // Baseline comparison pins the CLI-selected model for every stage.
        stageModels: undefined,
      },
      live ? 'production' : 'test',
      bounded.provider,
    );
    if (live) {
      adapter.settings.maxOutputTokens = budget.maxOutputTokens;
      const inputChars = Number(args.get('--max-input-chars'));
      if (!args.has('--max-input-chars') || !Number.isSafeInteger(inputChars) || inputChars < 0)
        throw new Error(
          'Explicit nonnegative limit required: --max-input-chars (0 disables character cap)',
        );
      adapter.settings.maxInputChars = inputChars;
    }
    if (!args.get('--output')) throw new Error('--output required');
    const output = resolve(args.get('--output')!);
    let records: unknown[], inputDigest: string | undefined;
    if (smoke) {
      const transcript = 'Redis 도입을 검토해보자';
      const context = { settings: adapter.settings, signal: new AbortController().signal };
      const extracted = await scheduler!.run(context.signal, signal =>
        adapter.extractGraph(transcript, {
          ...context,
          signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
        }),
      );
      const graph = GraphSchema.parse(extracted.value);
      if (graphIssues(graph).length) throw new Error('Smoke returned invalid graph');
      const verified = VerificationSchema.parse(
        (
          await scheduler!.run(context.signal, signal =>
            adapter.verifyGraph(transcript, graph, {
              ...context,
              signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
            }),
          )
        ).value,
      );
      records = [
        {
          providerConnected: true,
          structureValidated: true,
          semanticVerdict: verified.valid,
          qualityEvaluated: false,
        },
      ];
    } else {
      if (!args.get('--input')) throw new Error('--input required');
      const content = await readFile(resolve(args.get('--input')!), 'utf8');
      inputDigest = createHash('sha256').update(content).digest('hex');
      const limit = args.has('--limit') ? positive('--limit') : Infinity;
      const inputRecords = content
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as EvaluationInput)
        .slice(0, limit);
      const fixtures = fixturesPath
        ? (JSON.parse(await readFile(resolve(fixturesPath), 'utf8')) as Record<
            string,
            EvaluationFixture
          >)
        : undefined;
      records = await evaluateRecords(inputRecords, adapter, fixtures, bounded.provider, scheduler);
    }
    const result = {
      schemaVersion: 1,
      mode: smoke ? 'live-smoke' : live ? 'live-evaluation' : 'offline-fixture',
      manifest: {
        settings: adapter.settings,
        inputSha256: inputDigest,
        budget,
        consumption: bounded.usage(),
        baselineVersion: 'b327749-single-call',
        qualityEvaluated: false,
      },
      records,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(result, null, 2) + '\n');
    console.log(
      JSON.stringify({
        output,
        mode: result.mode,
        records: records.length,
        ...bounded.usage(),
        qualityEvaluated: false,
      }),
    );
  } finally {
    await liveDatabase?.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Evaluation failed');
    process.exitCode = 1;
  });
