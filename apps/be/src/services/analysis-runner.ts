import { AnalysisPolicy, createLogger } from '@ggaddak/shared';
import type { AnalyzeDiscussionParams, AnalyzeDiscussionResult } from '../domain/analysis.js';
import { AppError } from '../errors/AppError.js';
import { analysisFailure, classifyAnalysisError } from '../errors/analysis-error.js';
import { classifyAiFailure } from '../errors/ai-diagnostics.js';
import { AnalysisExecutionRepository } from '../repositories/analysis-execution.repository.js';
import { AnalysisRequestRepository } from '../repositories/analysis-request.repository.js';

const logger = createLogger('BE-ANALYSIS-RUNNER');

/** Owns every acquired lease through restore, execution, publication and cleanup. */
export class AnalysisRunner {
  constructor(
    private readonly requests: AnalysisRequestRepository,
    private readonly execution: AnalysisExecutionRepository,
  ) {}

  async run(
    params: AnalyzeDiscussionParams,
    work: (
      owner: string,
      signal: AbortSignal,
      assertExecutionOwner: () => Promise<void>,
    ) => Promise<AnalyzeDiscussionResult>,
    signal?: AbortSignal,
  ): Promise<AnalyzeDiscussionResult> {
    if (signal?.aborted) throw new AppError('Analysis cancelled', 503);
    const claim = await this.requests.claim(params);
    if (claim.result) return claim.result;
    let slot: Awaited<ReturnType<AnalysisExecutionRepository['acquire']>> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let renewal = Promise.resolve();
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      slot = await this.execution.acquire(params.requestId, params.channelId ?? 'channel');
      const lease = slot;
      heartbeat = setInterval(() => {
        renewal = renewal
          .then(async () => {
            await Promise.all([
              this.requests.renew(params.requestId, claim.owner),
              this.execution.renew(lease),
            ]);
          })
          .catch(error => controller.abort(error));
      }, AnalysisPolicy.leaseHeartbeatMs);
      heartbeat.unref();
      if (controller.signal.aborted) throw new AppError('Analysis cancelled', 503);
      const result = await work(claim.owner, controller.signal, () => this.execution.renew(lease));
      logger.info('analysis.completed', {
        requestId: params.requestId,
        traceId: params.traceId,
        guildId: params.guildId,
        channelId: params.channelId,
        outcome: result.found ? 'candidates' : 'no-candidates',
      });
      return result;
    } catch (error) {
      const classification = classifyAnalysisError(error);
      const aiFailure =
        error instanceof AppError &&
        (error.details?.providerResponse !== undefined || error.details?.failureKind !== undefined)
          ? classifyAiFailure(error, 'analysis')
          : undefined;
      logger.warn('analysis.failed', {
        requestId: params.requestId,
        traceId: params.traceId,
        guildId: params.guildId,
        channelId: params.channelId,
        category: classification.category,
        failureKind: aiFailure?.failureKind,
        retryable: classification.retryable,
        status: classification.status,
      });
      if (!classification.busy)
        await this.requests.fail(params.requestId, claim.owner, analysisFailure(error));
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (heartbeat) clearInterval(heartbeat);
      await renewal;
      await Promise.all([
        this.requests.release(params.requestId, claim.owner),
        ...(slot ? [this.execution.release(slot)] : []),
      ]);
    }
  }
}
