import { Service } from 'typedi';
import { createLogger } from '@ggaddak/shared';

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
