import { HarvestingPolicyConfig } from './config.js';
import { CONSENSUS_REGEX } from './tier1-filter.js';
import { evaluateSemanticDecision } from './semantic-scorer.js';

export function humanReactionCount(message: {
  reactionCount?: number;
  reactions?: Array<{ count: number; botCount?: number }>;
}): number {
  if (message.reactions?.length)
    return message.reactions.reduce((sum, r) => sum + Math.max(0, r.count - (r.botCount || 0)), 0);
  return Math.max(0, message.reactionCount || 0);
}

export function admitsDiscussion(
  messages: Array<{
    content: string;
    isBot?: boolean;
    reactionCount?: number;
    reactions?: Array<{ count: number; botCount?: number }>;
  }>,
  policy: HarvestingPolicyConfig,
  manual = false,
): boolean {
  if (manual) return true;
  const humans = messages.filter(m => !m.isBot);
  return (
    humans.some(
      m =>
        CONSENSUS_REGEX.test(m.content) ||
        evaluateSemanticDecision(m.content, policy.semanticThreshold).isCandidate,
    ) || humans.reduce((sum, m) => sum + humanReactionCount(m), 0) >= policy.reactionThreshold
  );
}
