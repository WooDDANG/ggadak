import { expect, test } from 'vitest';
import {
  runConcurrencyBenchmark,
  percentile,
  selectConcurrency,
  type BenchmarkSample,
} from '../src/evaluation/concurrency-benchmark.js';

test('calibration chooses the smallest measured N near peak throughput within latency and resource budgets', () => {
  const sample = (
    n: number,
    throughput: number,
    extra: Partial<BenchmarkSample> = {},
  ): BenchmarkSample => ({
    n,
    completedPerMinute: throughput,
    p95Ms: 100,
    errorRate: 0,
    peakRssMiB: 200,
    peakCpuPercent: 40,
    dbP95Ms: 5,
    probeP95Ms: 10,
    resourceSamplesAvailable: true,
    ...extra,
  });
  const limits = {
    maxP95Ms: 200,
    maxErrorRate: 0,
    maxRssMiB: 500,
    maxCpuPercent: 100,
    maxDbP95Ms: 20,
    maxProbeP95Ms: 20,
  };
  const samples = [
    sample(1, 10),
    sample(2, 20),
    sample(4, 20.5),
    sample(8, 30, { errorRate: 0.1 }),
  ];
  expect(selectConcurrency(samples, limits, true)).toBe(2);
  expect(selectConcurrency([sample(4, 25, { probeP95Ms: null })], limits, true)).toBeNull();
  expect(
    selectConcurrency([sample(4, 25, { resourceSamplesAvailable: false })], limits),
  ).toBeNull();
  expect(percentile([300, 10, 20], 0.95)).toBe(300);
});

test('completion latency includes all sequential sessions through the final commit', async () => {
  const result = await runConcurrencyBenchmark({
    ns: [1],
    rounds: 1,
    live: false,
    model: 'fixture',
    environment: 'test',
    budget: { maxCalls: 0, maxTokens: 0, maxOutputTokens: 8192 },
    maxDurationMs: 30000,
    thresholds: {
      maxP95Ms: 1,
      maxErrorRate: 0,
      maxRssMiB: 10000,
      maxCpuPercent: 1000,
      maxDbP95Ms: 1000,
      maxProbeP95Ms: 1000,
    },
    records: [
      {
        requestId: 'fixture',
        guildId: 'g',
        channelId: 'c',
        isManualOverride: true,
        rawMessages: Array.from({ length: 3 }, (_, index) => ({
          id: String(100 + index),
          author: 'Fixture',
          content: '데이터베이스 도입과 기술 선택을 논의합니다.',
          createdAt: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
        })),
      },
    ],
  });
  const sample = result.samples[0];
  expect(sample.completed).toBe(3);
  expect(sample.p95Ms).toBeGreaterThan(sample.activeStageP95Ms! * 2);
  expect(result.suggestedN).toBeNull();
  expect(result.productionRecommendation).toBeNull();
}, 30000);
