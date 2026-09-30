import crypto from 'node:crypto';
import { Decision, createLogger } from '@ggaddak/shared';
import { DecisionRepository } from '../db.js';
import { BackendExtractionEngine } from '../extractor/engine.js';

const logger = createLogger('BE-DISCUSSION-SERVICE');

export interface AnalyzeDiscussionParams {
  rawMessages: any[];
  guildId?: string;
  channelId?: string;
  channelName?: string;
  triggerMessageId?: string;
  messageUrl?: string;
}

export interface AnalyzeDiscussionResult {
  found: boolean;
  summary: string;
  decisions: Decision[];
  hasConflict?: boolean;
  conflictingDecision?: Decision;
}

export class DiscussionService {
  constructor(
    private repo: DecisionRepository,
    private extractor: BackendExtractionEngine,
  ) {}

  async analyzeDiscussion(params: AnalyzeDiscussionParams): Promise<AnalyzeDiscussionResult> {
    const { rawMessages, guildId, channelId, channelName, triggerMessageId, messageUrl } = params;

    // 1. Compute evidence hash for anti-recreation check
    const evidenceString = rawMessages
      .map((m: any) => m.id || `${m.author}:${m.content}:${m.createdAt}`)
      .join('|');
    const evidenceHash = crypto.createHash('sha256').update(evidenceString).digest('hex');

    if (this.repo.isEvidenceRejected(evidenceHash)) {
      logger.info(
        `[Analyze] Skipping analysis for evidence hash [${evidenceHash.slice(0, 8)}] - Previously rejected.`,
      );
      return {
        found: false,
        summary: '이전에 기각/삭제된 대화 구간입니다. 새 대화가 추가되면 다시 분석됩니다.',
        decisions: [],
      };
    }

    // 2. Retrieve recent external feedbacks for context injection
    const recentFeedbacks = this.repo.getRecentFeedbacks(channelId, 3);

    // 3. Build transcript
    const transcript = rawMessages
      .map((m: any) => {
        const time = m.createdAt ? new Date(m.createdAt).toISOString().substring(11, 19) : '';
        const reply = m.replyingTo ? ` (replying to ${m.replyingTo})` : '';
        return `[${time}] ${m.author}${reply}: ${m.content}`;
      })
      .join('\n');

    logger.info(
      `[Analyze] Analyzing ${rawMessages.length} messages from #${channelName || channelId}...`,
    );
    const extraction = await this.extractor.analyzeTranscript(transcript, recentFeedbacks);

    if (!extraction.found || extraction.decisions.length === 0) {
      logger.info(`[Analyze] No decisions found in discussion.`);
      return {
        found: false,
        summary: extraction.summary,
        decisions: [],
      };
    }

    const savedDecisions: Decision[] = [];
    let lastConflict: { hasConflict: boolean; conflictingDecision?: Decision } = {
      hasConflict: false,
    };

    const participants = Array.from(new Set(rawMessages.map((m: any) => m.author))) as string[];
    const rawEvidence = rawMessages.map((m: any) => m.id || m.content).filter(Boolean);

    for (const item of extraction.decisions) {
      const decisionId = `DEC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;

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

      const newDecision: Decision = {
        id: decisionId,
        topic: item.topic,
        decision: item.decision,
        title: item.title || item.topic,
        decisionContent: item.decisionContent || item.decision,
        rationale: item.rationale,
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
          rawMessages: rawMessages.map((m: any) => ({
            id: m.id,
            author: m.author,
            content: m.content,
            createdAt: m.createdAt || new Date().toISOString(),
            replyingTo: m.replyingTo,
          })),
        },
        messageCreatedAt:
          rawMessages[rawMessages.length - 1]?.createdAt || new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      this.repo.saveDecision(newDecision);
      savedDecisions.push(newDecision);

      logger.info(
        `[Analyze] Saved DRAFT Decision [${newDecision.id}] Title="${newDecision.title}" Category="${newDecision.categoryTag}"`,
      );
    }

    // Update checkpoint for channel
    if (channelId && triggerMessageId) {
      this.repo.saveCheckpoint(channelId, triggerMessageId);
    }

    return {
      found: true,
      summary: extraction.summary,
      decisions: savedDecisions,
      hasConflict: lastConflict.hasConflict,
      conflictingDecision: lastConflict.conflictingDecision,
    };
  }
}
