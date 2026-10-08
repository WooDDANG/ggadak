import { Service } from 'typedi';
import { createLogger, extractFeatures, computeCosineSimilarity } from '@ggaddak/shared';

const logger = createLogger('BE-EXTRACTOR-CORE');

export type ConsensusStrength = 'Strong' | 'Standard' | 'Weak' | 'Incomplete';

export interface GovernanceScoreResult {
  score: number;
  strength: ConsensusStrength;
  reason: string;
  passed: boolean;
}

export interface GovernanceInput {
  participantCount: number;
  reactionsCount: number;
  rationale: string;
  actionItemsCount: number;
  hasExternalFeedback?: boolean;
}

@Service()
export class DecisionExtractorCore {
  /**
   * Slices a continuous stream of messages into distinct discussion sessions
   * whenever an idle gap exceeding gapMinutes (default 30 min) is detected.
   */
  sliceMessagesByIdleGap<T extends { createdAt: string | Date }>(
    messages: T[],
    gapMinutes: number = 30,
  ): T[][] {
    if (!messages || messages.length === 0) return [];

    const sorted = [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const gapMs = gapMinutes * 60 * 1000;
    const sessions: T[][] = [];
    let currentSession: T[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prevTime = new Date(sorted[i - 1].createdAt).getTime();
      const currTime = new Date(sorted[i].createdAt).getTime();

      if (currTime - prevTime > gapMs) {
        sessions.push(currentSession);
        currentSession = [sorted[i]];
      } else {
        currentSession.push(sorted[i]);
      }
    }

    if (currentSession.length > 0) {
      sessions.push(currentSession);
    }

    logger.info(`[SessionSlicer] Split ${messages.length} messages into ${sessions.length} sessions (gap threshold: ${gapMinutes}m)`);
    return sessions;
  }

  /**
   * Slices messages into distinct sessions using hybrid 30-minute idle gap
   * and block-level TextTiling topic drift detection (depth score >= 0.35).
   * Enforces min 1 and max 100 message guardrails.
   */
  sliceSessionWithTopicDrift<T extends { createdAt: string | Date; content?: string; id?: string }>(
    messages: T[],
    gapMinutes: number = 30,
    depthThreshold: number = 0.35,
  ): T[][] {
    if (!messages || messages.length === 0) return [];

    // 1. Initial idle gap slicing (30 min)
    const baseSessions = this.sliceMessagesByIdleGap(messages, gapMinutes);
    const resultSessions: T[][] = [];

    for (const session of baseSessions) {
      if (session.length <= 15) {
        if (session.length > 100) {
          for (let i = 0; i < session.length; i += 100) {
            resultSessions.push(session.slice(i, i + 100));
          }
        } else {
          resultSessions.push(session);
        }
        continue;
      }

      // 2. Block-level TextTiling for long sessions (>= 16 messages)
      const blockSize = 3;
      const blocks: { text: string; startIndex: number; endIndex: number }[] = [];
      for (let i = 0; i < session.length; i += blockSize) {
        const slice = session.slice(i, i + blockSize);
        const text = slice.map(m => m.content || '').join(' ');
        blocks.push({ text, startIndex: i, endIndex: i + slice.length });
      }

      const blockVectors = blocks.map(b => extractFeatures(b.text));
      const similarities: number[] = [];
      for (let i = 0; i < blockVectors.length - 1; i++) {
        const sim = computeCosineSimilarity(blockVectors[i], blockVectors[i + 1]);
        similarities.push(sim);
      }

      // Compute TextTiling Depth Scores
      const splitIndices = new Set<number>();
      for (let i = 0; i < similarities.length; i++) {
        const prevSim = i > 0 ? similarities[i - 1] : similarities[i];
        const nextSim = i < similarities.length - 1 ? similarities[i + 1] : similarities[i];
        const currSim = similarities[i];
        const depth = (prevSim - currSim) + (nextSim - currSim);

        if (depth >= depthThreshold || currSim < 0.20) {
          splitIndices.add(blocks[i + 1].startIndex);
        }
      }

      if (splitIndices.size === 0) {
        if (session.length > 100) {
          for (let i = 0; i < session.length; i += 100) {
            resultSessions.push(session.slice(i, i + 100));
          }
        } else {
          resultSessions.push(session);
        }
      } else {
        const sortedSplits = Array.from(splitIndices).sort((a, b) => a - b);
        let lastIdx = 0;
        for (const splitIdx of sortedSplits) {
          if (splitIdx > lastIdx) {
            const sub = session.slice(lastIdx, splitIdx);
            if (sub.length > 0) resultSessions.push(sub);
            lastIdx = splitIdx;
          }
        }
        if (lastIdx < session.length) {
          const sub = session.slice(lastIdx);
          if (sub.length > 0) resultSessions.push(sub);
        }
        logger.info(
          `[TopicSlicer] Sliced long session (${session.length} msgs) into ${resultSessions.length} topic chunks via TextTiling`,
        );
      }
    }

    return resultSessions;
  }

  /**
   * Calculates a 4-tier Governance Score (1.0 to 4.0) based on consensus,
   * participant diversity, rationale clarity, and action items.
   */
  calculateGovernanceScore(input: GovernanceInput): GovernanceScoreResult {
    const { participantCount, reactionsCount, rationale, actionItemsCount, hasExternalFeedback } = input;
    const cleanRationale = (rationale || '').trim();

    // 1.0 - Incomplete / Missing Rationale
    if (cleanRationale.length < 10) {
      return {
        score: 1.0,
        strength: 'Incomplete',
        reason: '결정 근거(Rationale)가 불충분하거나 누락되었습니다.',
        passed: false,
      };
    }

    // 4.0 - Strong Consensus: 2+ participants, reactions or explicit items, good rationale
    if (
      participantCount >= 2 &&
      (reactionsCount >= 2 || hasExternalFeedback) &&
      cleanRationale.length >= 20 &&
      actionItemsCount > 0
    ) {
      return {
        score: 4.0,
        strength: 'Strong',
        reason: '다수 팀원 합의, 동의 반응 및 구체적 근거와 후속 실행 과제가 완비되었습니다.',
        passed: true,
      };
    }

    // 3.0 - Standard Consensus: 2+ participants or multiple reactions with valid rationale
    if (participantCount >= 2 || reactionsCount >= 2 || (reactionsCount >= 1 && hasExternalFeedback)) {
      return {
        score: 3.0,
        strength: 'Standard',
        reason: '팀원 간 합의와 명확한 근거가 제시된 표준 결정입니다.',
        passed: true,
      };
    }

    // 2.0 - Weak / Solo announcement
    return {
      score: 2.0,
      strength: 'Weak',
      reason: '1인 단독 통보이거나 참여자 간 상호 동의가 부족합니다.',
      passed: false,
    };
  }
}
