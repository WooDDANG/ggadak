import crypto from 'node:crypto';
import { AnalyzeDiscussionRequestDtoSchema } from '../dto/discussion.dto.js';
import { BadRequestError } from '../errors/AppError.js';
import { Inject, Service } from 'typedi';
import {
  Decision,
  createLogger,
  admitsDiscussion,
  humanReactionCount,
  getHarvestingPolicyFromEnv,
} from '@ggaddak/shared';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { AiAdapter, IAiAdapter } from '../adapters/ai.adapter.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';

import {
  AnalysisRequestRepository,
  CandidateDraft,
  hash,
  stableJson,
} from '../repositories/analysis-request.repository.js';

const logger = createLogger('BE-DISCUSSION-SERVICE');

export interface AnalyzeDiscussionParams {
  requestId: string;
  rawMessages: any[];
  guildId?: string;
  channelId?: string;
  channelName?: string;
  triggerMessageId?: string;
  messageUrl?: string;
  isManualOverride?: boolean;
  traceId?: string;
  score?: number;
  participantCount?: number;
  reactionsCount?: number;
}

export interface AnalyzeDiscussionResult {
  found: boolean;
  summary: string;
  decisions: Decision[];
  hasConflict?: boolean;
  conflictingDecision?: Decision;
}

@Service()
export class DiscussionService {
  constructor(
    private repo: DecisionRepository,
    @Inject(() => AiAdapter) private extractor: IAiAdapter,
    private core: DecisionExtractorCore,
  ) {}

  async analyzeDiscussion(params: AnalyzeDiscussionParams): Promise<AnalyzeDiscussionResult> {
    const parsed = AnalyzeDiscussionRequestDtoSchema.safeParse(params);
    if (!parsed.success)
      throw new BadRequestError('Invalid discussion payload', parsed.error.flatten());
    params = parsed.data;
    const requests = new AnalysisRequestRepository(this.repo);
    const claim = await requests.claim(params);
    if (claim.result) return claim.result;
    const drafts: CandidateDraft[] = [];
    let leaseFailure: unknown;
    const heartbeat = setInterval(() => {
      void requests.renew(params.requestId, claim.owner).catch(error => {
        leaseFailure = error;
      });
    }, 20_000);
    heartbeat.unref();
    try {
      const result = await this.extractDiscussion(params, drafts);
      if (leaseFailure) throw leaseFailure;
      return await requests.complete(params, claim.owner, result, drafts);
    } catch (error) {
      await requests.release(params.requestId, claim.owner);
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  async getCandidateHistory(decisionId: string) {
    return new AnalysisRequestRepository(this.repo).history(decisionId);
  }

  private async extractDiscussion(
    params: AnalyzeDiscussionParams,
    drafts: CandidateDraft[],
  ): Promise<AnalyzeDiscussionResult> {
    const {
      rawMessages,
      guildId,
      channelId,
      channelName,
      triggerMessageId,
      messageUrl,
      isManualOverride,
      traceId,
    } = params;
    const currentTraceId =
      traceId || `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const pipelineStartTime = Date.now();

    if (!rawMessages || rawMessages.length === 0) {
      return { found: false, summary: '분석할 메시지가 없습니다.', decisions: [] };
    }

    // 2. Retrieve recent external feedbacks for context injection
    const recentFeedbacks = await this.repo.getRecentFeedbacks(channelId, 3);

    // 2.5. Stage 2: Tier 1 Zero-Cost Rule Filtering & Synthetic Reaction Absorption
    const tier1Start = Date.now();
    const { filterTier1Messages } = await import('@ggaddak/shared');
    const tier1Result = filterTier1Messages(
      rawMessages.map((m: any) => ({
        id: m.id,
        author: m.author || m.authorName || 'unknown',
        authorId: m.authorId,
        content: m.content || '',
        createdAt: m.createdAt,
        isBot: m.isBot || m.author?.bot,
        replyingTo: m.replyingTo || m.referenceMessageId,
        attachments: m.attachments,
        reactionCount: humanReactionCount(m),
        reactions: m.reactions,
        isTrigger: m.isTrigger,
      })),
    );
    const tier1Duration = Date.now() - tier1Start;

    if (tier1Result.cleanMessages.length === 0) {
      logger.info(
        `All ${rawMessages.length} messages filtered out by Tier 1 rule filter. (Commands/Casual noise)`,
        {
          stage: 'TIER1-FILTER',
          traceId: currentTraceId,
          durationMs: tier1Duration,
          rawCount: rawMessages.length,
          filteredCount: tier1Result.filteredCount,
        },
      );
      return {
        found: false,
        summary: '의사결정 신호가 없는 일상 잡담/명령어 구간입니다.',
        decisions: [],
      };
    }

    logger.info(
      `Tier 1 filtering complete: ${rawMessages.length} raw -> ${tier1Result.cleanMessages.length} clean (${tier1Result.filteredCount} dropped, ${Object.keys(tier1Result.syntheticReactions).length} synthetic reactions absorbed)`,
      {
        stage: 'TIER1-FILTER',
        traceId: currentTraceId,
        durationMs: tier1Duration,
        rawCount: rawMessages.length,
        cleanCount: tier1Result.cleanMessages.length,
        filteredCount: tier1Result.filteredCount,
        syntheticCount: Object.keys(tier1Result.syntheticReactions).length,
      },
    );

    // 3. Stage 3: Conversation Disentanglement (Directed Forest & Burst Merging)
    const disentangleStart = Date.now();
    const { disentangleConversations, CONSENSUS_REGEX } = await import('@ggaddak/shared');
    const threads = disentangleConversations(tier1Result.cleanMessages, {
      channelId,
      syntheticReactions: tier1Result.syntheticReactions,
    });
    const disentangleDuration = Date.now() - disentangleStart;

    logger.info(
      `Disentangled ${tier1Result.cleanMessages.length} clean messages into ${threads.length} causal conversation thread(s)`,
      {
        stage: 'DISENTANGLE',
        traceId: currentTraceId,
        durationMs: disentangleDuration,
        threadCount: threads.length,
        threadLengths: threads.map(t => t.messages.length),
      },
    );

    // 4. Stage 4: Session Slicing with 30-min Idle Gap & TextTiling Topic Drift
    const sliceStart = Date.now();
    const candidateSessions: Array<typeof tier1Result.cleanMessages> = [];
    for (const thread of threads) {
      const topicChunks = this.core.sliceSessionWithTopicDrift(thread.messages, 30, 0.35);
      for (const chunk of topicChunks) {
        if (chunk.length > 0) {
          candidateSessions.push(chunk);
        }
      }
    }
    const sliceDuration = Date.now() - sliceStart;

    logger.info(
      `Topic slicing complete: ${threads.length} thread(s) sliced into ${candidateSessions.length} session chunk(s)`,
      {
        stage: 'TOPIC-SLICE',
        traceId: currentTraceId,
        durationMs: sliceDuration,
        sessionCount: candidateSessions.length,
        sessionSizes: candidateSessions.map(s => s.length),
      },
    );

    const allExtractedDecisions: Decision[] = [];
    let lastSummary = '대화가 분석되었습니다.';
    const lastConflict: { hasConflict: boolean; conflictingDecision?: Decision } = {
      hasConflict: false,
    };

    for (let sessionIdx = 0; sessionIdx < candidateSessions.length; sessionIdx++) {
      const sessionMessages = candidateSessions[sessionIdx];

      // 5. Stage 5: Decision Signal Escalation Gate (Union 3-way gate)
      const gateStart = Date.now();
      const hasManualOverride = Boolean(isManualOverride);
      const originalIds = new Set(
        sessionMessages.flatMap(m => m.originalMessages?.map(original => original.id) ?? [m.id]),
      );
      const originalSignals = rawMessages.filter(m => originalIds.has(m.id));
      const policy = getHarvestingPolicyFromEnv();
      const totalReactionsCount = sessionMessages.reduce(
        (sum: number, m: any) => sum + (m.reactionCount || 0),
        0,
      );
      const hasReactionSignal = totalReactionsCount >= policy.reactionThreshold;
      const hasConsensusSuffix = sessionMessages.some(m => CONSENSUS_REGEX.test(m.content || ''));
      const passesGate = admitsDiscussion(originalSignals, policy, hasManualOverride);
      const gateDuration = Date.now() - gateStart;

      logger.info(
        `Union 3-Way Gate evaluated for session [${sessionIdx + 1}/${candidateSessions.length}]: ` +
          `Override=${hasManualOverride}, Reactions=${totalReactionsCount}(>=3:${hasReactionSignal}), Suffix=${hasConsensusSuffix} -> Result=${passesGate ? 'PASS' : 'DROP'}`,
        {
          stage: '3WAY-GATE',
          traceId: currentTraceId,
          durationMs: gateDuration,
          sessionIndex: sessionIdx,
          passesGate,
          hasManualOverride,
          totalReactionsCount,
          hasReactionSignal,
          hasConsensusSuffix,
        },
      );

      if (!passesGate) {
        logger.info(
          `Session [${sessionIdx + 1}/${candidateSessions.length}] dropped by Union 3-Way Gate. Executing silent cleanup (0 token cost).`,
          { stage: '3WAY-GATE', traceId: currentTraceId, sessionIndex: sessionIdx },
        );
        continue;
      }

      const originalMessages = rawMessages
        .filter(m => originalIds.has(m.id))
        .map(m => ({
          id: m.id,
          author: m.author || m.authorName || 'unknown',
          content: m.content || '',
          createdAt: m.createdAt || '1970-01-01T00:00:00.000Z',
          ...(m.replyingTo || m.referenceMessageId
            ? { replyingTo: m.replyingTo || m.referenceMessageId }
            : {}),
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      const rawEvidence = originalMessages.map(m => m.id);
      const evidenceJson = stableJson({
        guildId: guildId || 'discord',
        channelId: channelId || 'channel',
        messages: originalMessages,
      });
      const evidenceHash = hash(JSON.parse(evidenceJson));
      const legacyHash = crypto.createHash('sha256').update(rawEvidence.join('|')).digest('hex');

      const transcript = originalMessages
        .map((m: any) => {
          const time = m.createdAt ? new Date(m.createdAt).toISOString().substring(11, 19) : '';
          const reply = m.replyingTo ? ` (replying to ${m.replyingTo})` : '';
          return `[${m.id}] [${time}] ${m.author}${reply}: ${m.content}`;
        })
        .join('\n');

      const aiStart = Date.now();
      logger.info(
        `Escalating session [${sessionIdx + 1}/${candidateSessions.length}] (${sessionMessages.length} msgs) to AI Core...`,
        { stage: 'AI-CORE', traceId: currentTraceId, msgCount: sessionMessages.length },
      );
      const extraction = await this.extractor.analyzeTranscript(transcript, recentFeedbacks);
      const aiDuration = Date.now() - aiStart;

      if (!extraction.found || extraction.decisions.length === 0) {
        logger.info(
          `AI Core returned no verified decision candidates for session [${sessionIdx + 1}/${candidateSessions.length}].`,
          { stage: 'AI-CORE', traceId: currentTraceId, durationMs: aiDuration },
        );
        continue;
      }

      logger.info(
        `AI Core successfully extracted ${extraction.decisions.length} decision candidate(s).`,
        {
          stage: 'AI-CORE',
          traceId: currentTraceId,
          durationMs: aiDuration,
          extractedCount: extraction.decisions.length,
        },
      );

      lastSummary = extraction.summary;
      const participants = Array.from(
        new Set(sessionMessages.map((m: any) => m.author)),
      ) as string[];
      for (const item of extraction.decisions) {
        const decisionId = `DEC-${crypto.randomUUID()}`;

        // Calculate 4-tier governance score entirely on Backend Core
        const govResult = this.core.calculateGovernanceScore({
          participantCount: participants.length,
          reactionsCount: totalReactionsCount,
          rationale: item.rationale,
          actionItemsCount: item.actionItems?.length || 0,
          hasExternalFeedback: recentFeedbacks.length > 0,
        });

        // Only explicit extraction evidence identifies a strategic Pivot. Topic matches are review comparisons.
        const isPivot = Boolean(item.isPivot);

        const finalScore = govResult.score;

        const newDecision: Decision = {
          id: decisionId,
          topic: item.topic,
          decision: item.decision,
          title: item.title || item.topic,
          decisionContent: item.decisionContent || item.decision,
          rationale: item.rationale,
          rationaleSummary: item.rationaleSummary || undefined,
          rationaleQuotes: item.rationaleQuotes || [],
          alternatives: item.alternatives || [],
          categoryTag: item.categoryTag || '기타',
          actionItems: item.actionItems || [],
          state: 'Draft',
          supersedesId: null,
          isPivot,
          approvedBy: null,
          decisionConfirmedDate: null,
          feedbackSourceType: null,
          feedbackSourceDetail: null,
          feedbackReceivedDate: null,
          rawEvidence,
          evidenceHash,
          rawTranscript: transcript,
          source: {
            guildId: guildId || 'discord',
            channelId: channelId || 'channel',
            channelName: channelName || undefined,
            triggerMessageId: triggerMessageId || 'msg-unknown',
            messageUrl: messageUrl || undefined,
            participants,
            rawMessages: originalMessages,
          },
          messageCreatedAt: sessionMessages[sessionMessages.length - 1]?.createdAt
            ? new Date(sessionMessages[sessionMessages.length - 1].createdAt).toISOString()
            : new Date().toISOString(),
          createdAt: new Date().toISOString(),
          governanceScore: finalScore,
          governanceReason: govResult.reason,
          governancePassed: finalScore >= 3.0,
        };

        drafts.push({ decision: newDecision, evidenceJson, legacyHash });
        allExtractedDecisions.push(newDecision);

        logger.info(
          `Staged DRAFT Candidate [${newDecision.id}] Score=${finalScore} (${govResult.strength}) Title="${newDecision.title}"`,
          {
            stage: 'GOVERNANCE',
            traceId: currentTraceId,
            decisionId: newDecision.id,
            score: finalScore,
            strength: govResult.strength,
            title: newDecision.title,
            passed: newDecision.governancePassed,
          },
        );
      }
    }

    const totalPipelineDuration = Date.now() - pipelineStartTime;
    logger.info(
      `Analysis pipeline completed with ${allExtractedDecisions.length} extracted decision(s) (+${totalPipelineDuration}ms)`,
      {
        stage: 'AI-CORE',
        traceId: currentTraceId,
        durationMs: totalPipelineDuration,
        decisionsCount: allExtractedDecisions.length,
      },
    );

    if (allExtractedDecisions.length === 0) {
      return {
        found: false,
        summary: '논의에서 구체적인 의사결정이 발견되지 않았습니다.',
        decisions: [],
      };
    }

    return {
      found: true,
      summary: lastSummary,
      decisions: allExtractedDecisions,
      hasConflict: lastConflict.hasConflict,
      conflictingDecision: lastConflict.conflictingDecision,
    };
  }
}
