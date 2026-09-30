import { DatabaseSync } from 'node:sqlite';
import { Decision, ExternalFeedback } from '@ggaddak/shared';

export class DecisionRepository {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        decision TEXT NOT NULL,
        title TEXT,
        decision_content TEXT,
        rationale TEXT NOT NULL,
        alternatives TEXT NOT NULL DEFAULT '[]',
        category_tag TEXT NOT NULL DEFAULT '기타',
        action_items TEXT NOT NULL DEFAULT '[]',
        state TEXT NOT NULL DEFAULT 'Draft',
        supersedes_id TEXT,
        is_pivot INTEGER NOT NULL DEFAULT 0,
        approved_by TEXT,
        decision_confirmed_date TEXT,
        feedback_source_type TEXT,
        feedback_source_detail TEXT,
        feedback_received_date TEXT,
        raw_evidence TEXT NOT NULL DEFAULT '[]',
        evidence_hash TEXT,
        raw_transcript TEXT,
        source TEXT NOT NULL,
        message_created_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_state ON decisions(state);
      CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);
      CREATE INDEX IF NOT EXISTS idx_decisions_category ON decisions(category_tag);
    `);

    // Column migrations for existing tables
    const optionalColumns = [
      `title TEXT`,
      `decision_content TEXT`,
      `alternatives TEXT NOT NULL DEFAULT '[]'`,
      `category_tag TEXT NOT NULL DEFAULT '기타'`,
      `is_pivot INTEGER NOT NULL DEFAULT 0`,
      `approved_by TEXT`,
      `decision_confirmed_date TEXT`,
      `feedback_source_type TEXT`,
      `feedback_source_detail TEXT`,
      `feedback_received_date TEXT`,
      `raw_evidence TEXT NOT NULL DEFAULT '[]'`,
      `evidence_hash TEXT`,
      `raw_transcript TEXT`,
      `source TEXT NOT NULL DEFAULT '{}'`,
      `message_created_at TEXT`
    ];

    for (const col of optionalColumns) {
      try {
        this.db.exec(`ALTER TABLE decisions ADD COLUMN ${col};`);
      } catch (_) {
        // Column already exists
      }
    }

    // Checkpoint table for incremental channel analysis
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channel_checkpoints (
        channel_id TEXT PRIMARY KEY,
        last_message_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // External feedbacks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS external_feedbacks (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        detail TEXT,
        content TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_feedbacks_channel ON external_feedbacks(channel_id);
    `);

    // Anti-recreation rejected evidence hashes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rejected_evidence_hashes (
        evidence_hash TEXT PRIMARY KEY,
        rejected_at TEXT NOT NULL
      );
    `);
  }

  // --- Checkpoints ---
  getCheckpoint(channelId: string): string | null {
    const stmt = this.db.prepare('SELECT last_message_id FROM channel_checkpoints WHERE channel_id = ?');
    const row = stmt.get(channelId) as { last_message_id: string } | undefined;
    return row ? row.last_message_id : null;
  }

  saveCheckpoint(channelId: string, lastMessageId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO channel_checkpoints (channel_id, last_message_id, updated_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(channelId, lastMessageId, new Date().toISOString());
  }

  // --- External Feedbacks ---
  saveFeedback(fb: ExternalFeedback): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO external_feedbacks (id, source, detail, content, channel_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(fb.id, fb.source, fb.detail ?? null, fb.content, fb.channelId, fb.createdAt);
  }

  getRecentFeedbacks(channelId?: string, limit: number = 5): ExternalFeedback[] {
    let query = 'SELECT * FROM external_feedbacks';
    const params: any[] = [];
    if (channelId) {
      query += ' WHERE channel_id = ?';
      params.push(channelId);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      source: r.source,
      detail: r.detail,
      content: r.content,
      channelId: r.channel_id,
      createdAt: r.created_at
    }));
  }

  // --- Anti-Recreation Hashes ---
  addRejectedEvidence(evidenceHash: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rejected_evidence_hashes (evidence_hash, rejected_at)
      VALUES (?, ?)
    `);
    stmt.run(evidenceHash, new Date().toISOString());
  }

  isEvidenceRejected(evidenceHash: string): boolean {
    const stmt = this.db.prepare('SELECT evidence_hash FROM rejected_evidence_hashes WHERE evidence_hash = ?');
    const row = stmt.get(evidenceHash);
    return !!row;
  }

  // --- Decisions ---
  saveDecision(decision: Decision): void {
    if (decision.supersedesId) {
      const updateStmt = this.db.prepare(
        `UPDATE decisions SET state = 'Superseded' WHERE id = ?`
      );
      updateStmt.run(decision.supersedesId);
    }

    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO decisions (
        id, topic, decision, title, decision_content, rationale, alternatives, category_tag,
        action_items, state, supersedes_id, is_pivot, approved_by, decision_confirmed_date,
        feedback_source_type, feedback_source_detail, feedback_received_date,
        raw_evidence, evidence_hash, raw_transcript, source, message_created_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      decision.id,
      decision.topic,
      decision.decision,
      decision.title ?? decision.topic,
      decision.decisionContent ?? decision.decision,
      decision.rationale,
      JSON.stringify(decision.alternatives || []),
      decision.categoryTag || '기타',
      JSON.stringify(decision.actionItems || []),
      decision.state,
      decision.supersedesId ?? null,
      decision.isPivot ? 1 : 0,
      decision.approvedBy ?? null,
      decision.decisionConfirmedDate ?? null,
      decision.feedbackSourceType ?? null,
      decision.feedbackSourceDetail ?? null,
      decision.feedbackReceivedDate ?? null,
      JSON.stringify(decision.rawEvidence || []),
      decision.evidenceHash ?? null,
      decision.rawTranscript ?? null,
      JSON.stringify(decision.source),
      decision.messageCreatedAt ?? null,
      decision.createdAt
    );
  }

  reviewDecision(id: string, action: 'confirm' | 'defer' | 'reject' | 'edit', params?: {
    approvedBy?: string;
    title?: string;
    decisionContent?: string;
    rationale?: string;
    categoryTag?: string;
  }): Decision | null {
    const existing = this.getDecisionById(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    if (action === 'confirm') {
      existing.state = 'Decided';
      existing.approvedBy = params?.approvedBy || 'reviewer';
      existing.decisionConfirmedDate = now;
      if (params?.title) {
        existing.title = params.title;
        existing.topic = params.title;
      }
      if (params?.decisionContent) {
        existing.decisionContent = params.decisionContent;
        existing.decision = params.decisionContent;
      }
      if (params?.rationale) existing.rationale = params.rationale;
      if (params?.categoryTag) existing.categoryTag = params.categoryTag as any;
    } else if (action === 'defer') {
      existing.state = 'Deferred';
    } else if (action === 'reject') {
      existing.state = 'Rejected';
      if (existing.evidenceHash) {
        this.addRejectedEvidence(existing.evidenceHash);
      }
    } else if (action === 'edit') {
      if (params?.title) {
        existing.title = params.title;
        existing.topic = params.title;
      }
      if (params?.decisionContent) {
        existing.decisionContent = params.decisionContent;
        existing.decision = params.decisionContent;
      }
      if (params?.rationale) existing.rationale = params.rationale;
      if (params?.categoryTag) existing.categoryTag = params.categoryTag as any;
    }

    this.saveDecision(existing);
    return existing;
  }

  getDecisions(filters?: { topic?: string; state?: string; categoryTag?: string }): Decision[] {
    let query = 'SELECT * FROM decisions';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.topic) {
      conditions.push('topic = ?');
      params.push(filters.topic);
    }
    if (filters?.state) {
      conditions.push('state = ?');
      params.push(filters.state);
    }
    if (filters?.categoryTag) {
      conditions.push('category_tag = ?');
      params.push(filters.categoryTag);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      topic: row.topic,
      decision: row.decision,
      title: row.title ?? row.topic,
      decisionContent: row.decision_content ?? row.decision,
      rationale: row.rationale,
      alternatives: row.alternatives ? JSON.parse(row.alternatives) : [],
      categoryTag: row.category_tag || '기타',
      actionItems: row.action_items ? JSON.parse(row.action_items) : [],
      state: row.state,
      supersedesId: row.supersedes_id,
      isPivot: Boolean(row.is_pivot),
      approvedBy: row.approved_by,
      decisionConfirmedDate: row.decision_confirmed_date,
      feedbackSourceType: row.feedback_source_type,
      feedbackSourceDetail: row.feedback_source_detail,
      feedbackReceivedDate: row.feedback_received_date,
      rawEvidence: row.raw_evidence ? JSON.parse(row.raw_evidence) : [],
      evidenceHash: row.evidence_hash,
      rawTranscript: row.raw_transcript,
      source: JSON.parse(row.source),
      messageCreatedAt: row.message_created_at,
      createdAt: row.created_at
    }));
  }

  getDecisionById(id: string): Decision | null {
    const stmt = this.db.prepare('SELECT * FROM decisions WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      topic: row.topic,
      decision: row.decision,
      title: row.title ?? row.topic,
      decisionContent: row.decision_content ?? row.decision,
      rationale: row.rationale,
      alternatives: row.alternatives ? JSON.parse(row.alternatives) : [],
      categoryTag: row.category_tag || '기타',
      actionItems: row.action_items ? JSON.parse(row.action_items) : [],
      state: row.state,
      supersedesId: row.supersedes_id,
      isPivot: Boolean(row.is_pivot),
      approvedBy: row.approved_by,
      decisionConfirmedDate: row.decision_confirmed_date,
      feedbackSourceType: row.feedback_source_type,
      feedbackSourceDetail: row.feedback_source_detail,
      feedbackReceivedDate: row.feedback_received_date,
      rawEvidence: row.raw_evidence ? JSON.parse(row.raw_evidence) : [],
      evidenceHash: row.evidence_hash,
      rawTranscript: row.raw_transcript,
      source: JSON.parse(row.source),
      messageCreatedAt: row.message_created_at,
      createdAt: row.created_at
    };
  }

  close() {
    this.db.close();
  }
}
