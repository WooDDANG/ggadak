import crypto from 'node:crypto';
import { Service } from 'typedi';
import { Decision, createLogger } from '@ggaddak/shared';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { AiAdapter } from '../adapters/ai.adapter.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';

const logger = createLogger('BE-DISCUSSION-SERVICE');

export interface AnalyzeDiscussionParams {
  rawMessages: any[];
  guildId?: string;
  channelId?: string;
  channelName?: string;
  triggerMessageId?: string;
  messageUrl?: string;
  isManualOverride?: boolean;
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
    private extractor: AiAdapter,
    private core: DecisionExtractorCore,
  ) {}

  async analyzeDiscussion(params: AnalyzeDiscussionParams): Promise<AnalyzeDiscussionResult> {
    const { rawMessages, guildId, channelId, channelName, triggerMessageId, messageUrl, isManualOverride } = params;

    if (!rawMessages || rawMessages.length === 0) {
      return { found: false, summary: '분석할 메시지가 없습니다.', decisions: [] };
    }

    // 1. Compute evidence hash for anti-recreation check
    const evidenceString = rawMessages
      .map((m: any) => m.id || `${m.author}:${m.content}:${m.createdAt}`)
      .join('|');
    const evidenceHash = crypto.createHash('sha256').update(evidenceString).digest('hex');

    // Anti-recreation check: Skip if rejected UNLESS manually overridden (📌 or /스캔)
    if (this.repo.isEvidenceRejected(evidenceHash) && !isManualOverride) {
      logger.info(
        `[Analyze] Skipping analysis for evidence hash [${evidenceHash.slice(0, 8)}] - Previously rejected (override=${isManualOverride}).`,
      );
      return {
        found: false,
        summary: '이전에 기각/삭제된 대화 구간입니다. (📌 핀 또는 수동 스캔으로 강제 재분석 가능)',
        decisions: [],
      };
    }

    // 2. Retrieve recent external feedbacks for context injection
    const recentFeedbacks = this.repo.getRecentFeedbacks(channelId, 3);

    // 2.5. Tier 1 Zero-Cost Rule Filtering & Synthetic Reaction Absorption
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
        reactionCount: m.reactionCount || 0,
        reactions: m.reactions,
        isTrigger: m.isTrigger,
      })),
    );

    if (tier1Result.cleanMessages.length === 0) {
      logger.info(`[Analyze] All ${rawMessages.length} messages filtered out by Tier 1 rule filter.`);
      return {
        found: false,
        summary: '의사결정 신호가 없는 일상 잡담/명령어 구간입니다.',
        decisions: [],
      };
    }

    logger.info(
      `[Analyze] Tier 1 filter: ${rawMessages.length} raw -> ${tier1Result.cleanMessages.length} clean (${tier1Result.filteredCount} filtered, ${Object.keys(tier1Result.syntheticReactions).length} synthetic reactions absorbed)`,
    );

    // 3. Conversation Disentanglement (Directed Forest & Burst Merging)
    const { disentangleConversations, CONSENSUS_REGEX } = await import('@ggaddak/shared');
    const threads = disentangleConversations(tier1Result.cleanMessages, {
      channelId,
      syntheticReactions: tier1Result.syntheticReactions,
    });

    // 4. Session Slicing with 30-min Idle Gap & TextTiling Topic Drift
    const candidateSessions: Array<typeof tier1Result.cleanMessages> = [];
    for (const thread of threads) {
      const topicChunks = this.core.sliceSessionWithTopicDrift(thread.messages, 30, 0.35);
      for (const chunk of topicChunks) {
        if (chunk.length > 0) {
          candidateSessions.push(chunk);
        }
      }
    }

    const allExtractedDecisions: Decision[] = [];
    let lastSummary = '대화가 분석되었습니다.';
    let lastConflict: { hasConflict: boolean; conflictingDecision?: Decision } = {
      hasConflict: false,
    };

    for (const sessionMessages of candidateSessions) {
      // 5. Stage 5: Decision Signal Escalation Gate (Union 3-way gate)
      // Signal A: Manual 📌 Pin / Explicit scan override
      const hasManualOverride = Boolean(isManualOverride);
      // Signal B: Reaction count >= 3
      const totalReactionsCount = sessionMessages.reduce(
        (sum: number, m: any) => sum + (m.reactionCount || 0),
        0,
      );
      const hasReactionSignal = totalReactionsCount >= 3;
      // Signal C: Decision consensus suffix matching
      const hasConsensusSuffix = sessionMessages.some(m => CONSENSUS_REGEX.test(m.content || ''));

      // Union Gate: At least one signal must be present to escalate to LLM
      const passesGate = hasManualOverride || hasReactionSignal || hasConsensusSuffix;

      if (!passesGate) {
        logger.info(
          `[Analyze] Session (${sessionMessages.length} msgs) dropped by Union 3-Way Gate (override=${hasManualOverride}, rx=${totalReactionsCount}, suffix=${hasConsensusSuffix}). Silent cleanup.`,
        );
        continue;
      }

      const transcript = sessionMessages
        .map((m: any) => {
          const time = m.createdAt ? new Date(m.createdAt).toISOString().substring(11, 19) : '';
          const reply = m.replyingTo ? ` (replying to ${m.replyingTo})` : '';
          return `[${time}] ${m.author}${reply}: ${m.content}`;
        })
        .join('\n');

      logger.info(
        `[Analyze] Escalating session (${sessionMessages.length} msgs) to AI Core from #${channelName || channelId}...`,
      );
      const extraction = await this.extractor.analyzeTranscript(transcript, recentFeedbacks);

      if (!extraction.found || extraction.decisions.length === 0) {
        continue;
      }

      lastSummary = extraction.summary;
      const participants = Array.from(new Set(sessionMessages.map((m: any) => m.author))) as string[];
      const rawEvidence = sessionMessages.map((m: any) => m.id || m.content).filter(Boolean);

      for (const item of extraction.decisions) {
        const decisionId = `DEC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;

        // Calculate 4-tier governance score entirely on Backend Core
        const govResult = this.core.calculateGovernanceScore({
          participantCount: participants.length,
          reactionsCount: totalReactionsCount,
          rationale: item.rationale,
          actionItemsCount: item.actionItems?.length || 0,
          hasExternalFeedback: recentFeedbacks.length > 0,
        });

        // Conflict / Pivot check with existing active decisions
        const existingActive = this.repo.getDecisions({ topic: item.topic, state: 'Decided' });
        const conflicting = existingActive.length > 0 ? existingActive[0] : undefined;
        const isPivot = Boolean(item.isPivot || conflicting);

        if (conflicting) {
          lastConflict = {
            hasConflict: true,
            conflictingDecision: conflicting,
          };
        }

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
            rawMessages: sessionMessages.map((m: any) => ({
              id: m.id,
              author: m.author,
              content: m.content,
              createdAt: m.createdAt || new Date().toISOString(),
              replyingTo: m.replyingTo,
              reactionCount: m.reactionCount || 0,
              reactions: m.reactions || [],
              isTrigger: m.isTrigger || false,
            })),
          },
          messageCreatedAt: sessionMessages[sessionMessages.length - 1]?.createdAt
            ? new Date(sessionMessages[sessionMessages.length - 1].createdAt).toISOString()
            : new Date().toISOString(),
          createdAt: new Date().toISOString(),
          governanceScore: finalScore,
          governanceReason: govResult.reason,
          governancePassed: finalScore >= 3.0,
        };

        this.repo.saveDecision(newDecision);
        allExtractedDecisions.push(newDecision);

        logger.info(
          `[Analyze] Saved DRAFT Candidate [${newDecision.id}] Score=${finalScore} (${govResult.strength}) Title="${newDecision.title}"`,
        );
      }
    }

    // Update checkpoint for channel
    if (channelId && triggerMessageId) {
      this.repo.saveCheckpoint(channelId, triggerMessageId);
    }

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
