import { DatabaseSync } from 'node:sqlite';
import { Service } from 'typedi';
import { Decision, ExternalFeedback, ReviewAction } from '@ggaddak/shared';
import { DecisionMapper, FeedbackMapper } from '../mappers/index.js';
import { DecisionDbRow, FeedbackDbRow } from '../models/index.js';

@Service()
export class DecisionRepository {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    const targetPath = dbPath || process.env.DATABASE_PATH || 'decisions.sqlite';
    this.db = new DatabaseSync(targetPath);
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
      `message_created_at TEXT`,
    ];

    for (const col of optionalColumns) {
      try {
        this.db.exec(`ALTER TABLE decisions ADD COLUMN ${col};`);
      } catch {
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
    const stmt = this.db.prepare(
      'SELECT last_message_id FROM channel_checkpoints WHERE channel_id = ?',
    );
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
      INSERT OR REPLACE INTO external_feedbacks (
        id, source, detail, content, channel_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      fb.id,
      fb.source,
      fb.detail || null,
      fb.content,
      fb.channelId || 'global',
      fb.createdAt || new Date().toISOString(),
    );
  }

  getRecentFeedbacks(channelId?: string, limit: number = 5): ExternalFeedback[] {
    let query = 'SELECT * FROM external_feedbacks';
    const params: any[] = [];
    if (channelId) {
      query += ' WHERE channel_id = ? OR channel_id = ?';
      params.push(channelId, 'global');
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as unknown as FeedbackDbRow[];
    return rows.map(r => FeedbackMapper.toDomain(r));
  }

  // --- Anti-Recreation Rejected Evidence Memory ---
  recordRejectedEvidence(evidenceHash: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO rejected_evidence_hashes (evidence_hash, rejected_at)
      VALUES (?, ?)
    `);
    stmt.run(evidenceHash, new Date().toISOString());
  }

  isEvidenceRejected(evidenceHash: string): boolean {
    const stmt = this.db.prepare(
      'SELECT evidence_hash FROM rejected_evidence_hashes WHERE evidence_hash = ?',
    );
    const row = stmt.get(evidenceHash);
    return Boolean(row);
  }

  // --- Decisions ---
  saveDecision(decision: Decision): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO decisions (
        id, topic, decision, title, decision_content, rationale,
        alternatives, category_tag, action_items, state, supersedes_id,
        is_pivot, approved_by, decision_confirmed_date,
        feedback_source_type, feedback_source_detail, feedback_received_date,
        raw_evidence, evidence_hash, raw_transcript, source,
        message_created_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      decision.id,
      decision.topic,
      decision.decision,
      decision.title || decision.topic,
      decision.decisionContent || decision.decision,
      decision.rationale,
      JSON.stringify(decision.alternatives || []),
      decision.categoryTag || '기타',
      JSON.stringify(decision.actionItems || []),
      decision.state,
      decision.supersedesId || null,
      decision.isPivot ? 1 : 0,
      decision.approvedBy || null,
      decision.decisionConfirmedDate || null,
      decision.feedbackSourceType || null,
      decision.feedbackSourceDetail || null,
      decision.feedbackReceivedDate || null,
      JSON.stringify(decision.rawEvidence || []),
      decision.evidenceHash || null,
      decision.rawTranscript || null,
      JSON.stringify(decision.source || {}),
      decision.messageCreatedAt || null,
      decision.createdAt || new Date().toISOString(),
    );

    // If this decision supersedes a previous one, mark the previous as Superseded
    if (decision.supersedesId) {
      const superStmt = this.db.prepare(
        `UPDATE decisions SET state = 'Superseded' WHERE id = ?`,
      );
      superStmt.run(decision.supersedesId);
    }
  }

  getDecisionById(id: string): Decision | null {
    const stmt = this.db.prepare('SELECT * FROM decisions WHERE id = ?');
    const row = stmt.get(id) as unknown as DecisionDbRow | undefined;
    if (!row) return null;
    return DecisionMapper.toDomain(row);
  }

  getDecisions(filter: { topic?: string; state?: string; categoryTag?: string } = {}): Decision[] {
    let query = 'SELECT * FROM decisions WHERE 1=1';
    const params: any[] = [];

    if (filter.topic) {
      query += ' AND topic = ?';
      params.push(filter.topic);
    }
    if (filter.state) {
      query += ' AND state = ?';
      params.push(filter.state);
    }
    if (filter.categoryTag) {
      query += ' AND category_tag = ?';
      params.push(filter.categoryTag);
    }

    query += ' ORDER BY created_at DESC';
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as unknown as DecisionDbRow[];
    return rows.map(r => DecisionMapper.toDomain(r));
  }

  reviewDecision(
    id: string,
    action: ReviewAction['action'],
    params: Omit<ReviewAction, 'action'> = {},
  ): Decision | null {
    const existing = this.getDecisionById(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    if (action === 'confirm') {
      existing.state = 'Decided';
      existing.approvedBy = params.approvedBy || 'Reviewer';
      existing.decisionConfirmedDate = now;
      if (params.title) existing.title = params.title;
      if (params.decisionContent) existing.decisionContent = params.decisionContent;
      if (params.rationale) existing.rationale = params.rationale;
      if (params.categoryTag) existing.categoryTag = params.categoryTag;
    } else if (action === 'defer') {
      existing.state = 'Deferred';
    } else if (action === 'reject') {
      existing.state = 'Rejected';
      if (existing.evidenceHash) {
        this.recordRejectedEvidence(existing.evidenceHash);
      }
    } else if (action === 'edit') {
      if (params.title) existing.title = params.title;
      if (params.decisionContent) existing.decisionContent = params.decisionContent;
      if (params.rationale) existing.rationale = params.rationale;
      if (params.categoryTag) existing.categoryTag = params.categoryTag;
    }

    this.saveDecision(existing);
    return existing;
  }

  close(): void {
    this.db.close();
  }
}
