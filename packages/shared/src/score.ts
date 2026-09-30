export interface DiscussionScoreInput {
  participantCount: number;
  reactionsCount: number;
  messageCount: number;
  hasConsensusKeyword?: boolean;
}

export interface DiscussionScoreResult {
  score: number; // 1.0 to 4.0
  participantCount: number;
  reactionsCount: number;
  tier: 'Strong' | 'Standard' | 'Weak' | 'Incomplete';
  reason: string;
}

/**
 * Calculates a discussion consensus score (1.0 to 4.0) directly from Discord metrics:
 * participant count, total emoji reactions count, and conversation length.
 */
export function calculateDiscussionScore(input: DiscussionScoreInput): DiscussionScoreResult {
  const { participantCount, reactionsCount, messageCount, hasConsensusKeyword } = input;

  // 4.0 - Strong: 2+ participants, 2+ reactions, and active context (or explicit consensus keyword)
  if (participantCount >= 2 && reactionsCount >= 2 && (messageCount >= 3 || hasConsensusKeyword)) {
    return {
      score: 4.0,
      participantCount,
      reactionsCount,
      tier: 'Strong',
      reason: '다수 참여자 합의 및 이모지 반응 활성화 (강한 합의)',
    };
  }

  // 3.0 - Standard: 2+ participants or 2+ reactions
  if (participantCount >= 2 || reactionsCount >= 2) {
    return {
      score: 3.0,
      participantCount,
      reactionsCount,
      tier: 'Standard',
      reason: '2인 이상 참여 또는 합의 이모지 반응 존재 (표준 합의)',
    };
  }

  // 2.0 - Weak: 1 participant with minimal reactions or keyword
  if (participantCount === 1 && (reactionsCount >= 1 || hasConsensusKeyword)) {
    return {
      score: 2.0,
      participantCount,
      reactionsCount,
      tier: 'Weak',
      reason: '단독 발화이나 합의 키워드/이모지 포함 (약한 합의)',
    };
  }

  // 1.0 - Incomplete
  return {
    score: 1.0,
    participantCount,
    reactionsCount,
    tier: 'Incomplete',
    reason: '참여자 및 반응 부족 (단순 대화/불충분)',
  };
}
