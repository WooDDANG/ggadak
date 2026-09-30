import { Decision } from '@ggaddak/shared';

export interface DecisionDbRow {
  id: string;
  topic: string;
  title: string | null;
  decision: string;
  decision_content: string | null;
  rationale: string;
  alternatives: string;
  category_tag: string;
  action_items: string;
  state: string;
  supersedes_id: string | null;
  is_pivot: number;
  approved_by: string | null;
  decision_confirmed_date: string | null;
  feedback_source_type: string | null;
  feedback_source_detail: string | null;
  feedback_received_date: string | null;
  raw_evidence: string;
  evidence_hash: string | null;
  raw_transcript: string | null;
  source: string;
  message_created_at: string | null;
  created_at: string;
}

export type DecisionEntity = Decision;
