import { DatabaseSync } from 'node:sqlite';
import { DecisionPayload } from '@ggaddak/shared';

export class EgressQueue {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS egress_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_queue_status ON egress_queue(status);
    `);
  }

  enqueue(payload: DecisionPayload): number {
    const stmt = this.db.prepare(`
      INSERT INTO egress_queue (payload_id, payload_json, status, attempts, created_at)
      VALUES (?, ?, 'PENDING', 0, ?)
    `);

    const result = stmt.run(payload.payload.id, JSON.stringify(payload), new Date().toISOString());

    return Number(result.lastInsertRowid);
  }

  async dispatchPending(webhookUrl: string): Promise<{ sent: number; failed: number }> {
    const stmt = this.db.prepare(`
      SELECT * FROM egress_queue WHERE status = 'PENDING' ORDER BY id ASC LIMIT 50
    `);

    const rows = stmt.all() as any[];
    let sentCount = 0;
    let failedCount = 0;

    for (const row of rows) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: row.payload_json,
        });

        if (res.ok) {
          const updateStmt = this.db.prepare(
            `UPDATE egress_queue SET status = 'SENT' WHERE id = ?`,
          );
          updateStmt.run(row.id);
          sentCount++;
        } else {
          const updateStmt = this.db.prepare(
            `UPDATE egress_queue SET attempts = attempts + 1 WHERE id = ?`,
          );
          updateStmt.run(row.id);
          failedCount++;
        }
      } catch {
        const updateStmt = this.db.prepare(
          `UPDATE egress_queue SET attempts = attempts + 1 WHERE id = ?`,
        );
        updateStmt.run(row.id);
        failedCount++;
      }
    }

    return { sent: sentCount, failed: failedCount };
  }

  getPendingCount(): number {
    const stmt = this.db.prepare(
      `SELECT count(*) as count FROM egress_queue WHERE status = 'PENDING'`,
    );
    const row = stmt.get() as any;
    return row.count;
  }

  close() {
    this.db.close();
  }
}
