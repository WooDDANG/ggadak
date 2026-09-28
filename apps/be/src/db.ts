import { DatabaseSync } from 'node:sqlite';
import { Decision, DecisionPayload } from '@ggaddak/shared';

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
        rationale TEXT NOT NULL,
        action_items TEXT NOT NULL,
        state TEXT NOT NULL,
        supersedes_id TEXT,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_state ON decisions(state);
      CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);
    `);
  }

  saveDecision(decision: Decision): void {
    if (decision.supersedesId) {
      const updateStmt = this.db.prepare(
        `UPDATE decisions SET state = 'Superseded' WHERE id = ?`
      );
      updateStmt.run(decision.supersedesId);
    }

    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO decisions (
        id, topic, decision, rationale, action_items, state, supersedes_id, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      decision.id,
      decision.topic,
      decision.decision,
      decision.rationale,
      JSON.stringify(decision.actionItems),
      decision.state,
      decision.supersedesId ?? null,
      JSON.stringify(decision.source),
      decision.createdAt
    );
  }

  getDecisions(filters?: { topic?: string; state?: string }): Decision[] {
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
      rationale: row.rationale,
      actionItems: JSON.parse(row.action_items),
      state: row.state,
      supersedesId: row.supersedes_id,
      source: JSON.parse(row.source),
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
      rationale: row.rationale,
      actionItems: JSON.parse(row.action_items),
      state: row.state,
      supersedesId: row.supersedes_id,
      source: JSON.parse(row.source),
      createdAt: row.created_at
    };
  }

  close() {
    this.db.close();
  }
}
