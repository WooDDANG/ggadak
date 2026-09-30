import { Decision, DecisionState } from '@ggaddak/shared';
import { DecisionDbRow } from '../models/decision.entity.js';

export class DecisionMapper {
  static toDomain(row: DecisionDbRow): Decision {
    return {
      id: row.id,
      topic: row.topic,
      title: row.title || row.topic,
      decision: row.decision,
      decisionContent: row.decision_content || row.decision,
      rationale: row.rationale,
      alternatives: JSON.parse(row.alternatives || '[]'),
      categoryTag: (row.category_tag as any) || '기타',
      actionItems: JSON.parse(row.action_items || '[]'),
      state: row.state as DecisionState,
      supersedesId: row.supersedes_id,
      isPivot: Boolean(row.is_pivot),
      approvedBy: row.approved_by,
      decisionConfirmedDate: row.decision_confirmed_date,
      feedbackSourceType: (row.feedback_source_type as any) || null,
      feedbackSourceDetail: row.feedback_source_detail,
      feedbackReceivedDate: row.feedback_received_date,
      rawEvidence: JSON.parse(row.raw_evidence || '[]'),
      evidenceHash: row.evidence_hash || undefined,
      rawTranscript: row.raw_transcript || undefined,
      source: JSON.parse(row.source || '{}'),
      messageCreatedAt: row.message_created_at || undefined,
      createdAt: row.created_at,
    };
  }
}
