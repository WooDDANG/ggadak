import { Decision } from '@ggaddak/shared';

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingDecision?: Decision;
}

export class ConflictDetector {
  private activeDecisions: Map<string, Decision> = new Map();

  registerDecision(decision: Decision) {
    if (decision.supersedesId) {
      const old = this.activeDecisions.get(decision.supersedesId);
      if (old) {
        old.state = 'Superseded';
      }
    }
    this.activeDecisions.set(decision.id, decision);
  }

  checkConflict(topic: string): ConflictCheckResult {
    const normalizedTopic = topic.trim().toLowerCase();

    for (const decision of this.activeDecisions.values()) {
      if (decision.state === 'Decided' && decision.topic.trim().toLowerCase() === normalizedTopic) {
        return {
          hasConflict: true,
          conflictingDecision: decision
        };
      }
    }

    return { hasConflict: false };
  }

  getActiveDecisions(): Decision[] {
    return Array.from(this.activeDecisions.values()).filter(d => d.state === 'Decided');
  }

  clear() {
    this.activeDecisions.clear();
  }
}
