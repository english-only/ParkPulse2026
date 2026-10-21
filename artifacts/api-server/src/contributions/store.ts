/**
 * Contribution store.
 *
 * SQLite through Node's built-in `node:sqlite` — no native addon, no external
 * database service. The file is the durable record of every submission,
 * including rejected ones, so a decision can be audited after the fact.
 *
 * The public API never reads contributor contact details; only the moderation
 * routes receive them, and only when the caller presents the moderation token.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { parseStoredRecord, type ValidatedRecord } from "./validation.js";

export type BatchStatus = "pending" | "accepted" | "rejected";

export interface BatchInput {
  records: ValidatedRecord[];
  contributor: string | null;
  contact: string | null;
  note: string | null;
  sourceFormat: string;
  ipHash: string | null;
}

export interface PublicBatch {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: BatchStatus;
  recordCount: number;
  sourceFormat: string;
  categories: Record<string, number>;
}

export interface ModeratedBatch extends PublicBatch {
  contributor: string | null;
  contact: string | null;
  note: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  records: {
    id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
    excluded: boolean;
    payload: unknown;
  }[];
}

export interface Store {
  createBatch(input: BatchInput): PublicBatch;
  getPublicBatch(id: string): PublicBatch | null;
  getModeratedBatch(id: string): ModeratedBatch | null;
  listBatches(options: { status?: BatchStatus; limit: number; offset: number }): ModeratedBatch[];
  countsByStatus(): Record<BatchStatus, number>;
  reviewBatch(id: string, status: Exclude<BatchStatus, "pending">, note: string | null): ModeratedBatch | null;
  setRecordExcluded(batchId: string, recordId: string, excluded: boolean): boolean;
  exportAccepted(): { records: ValidatedRecord[]; batchIds: string[] };
  close(): void;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contribution_batches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  contributor TEXT,
  contact TEXT,
  note TEXT,
  review_note TEXT,
  source_format TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  ip_hash TEXT,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS contribution_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES contribution_batches(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  excluded INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS contribution_records_batch ON contribution_records(batch_id);
CREATE INDEX IF NOT EXISTS contribution_records_status ON contribution_records(status);
CREATE INDEX IF NOT EXISTS contribution_batches_status ON contribution_batches(status, created_at DESC);

CREATE TABLE IF NOT EXISTS contribution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
`;

/** SQLite errors are logged by code, not leaked to the client. */
export class StoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}

export function openStore(databasePath: string): Store {
  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new DatabaseSync(databasePath);
  db.exec(SCHEMA);

  const insertBatch = db.prepare(`
    INSERT INTO contribution_batches
      (id, created_at, updated_at, status, contributor, contact, note, source_format, record_count, ip_hash)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
  `);
  const insertRecord = db.prepare(`
    INSERT INTO contribution_records (id, batch_id, payload, status, category, name, lat, lng, excluded)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, 0)
  `);
  const insertEvent = db.prepare(
    "INSERT INTO contribution_events (batch_id, at, action, detail) VALUES (?, ?, ?, ?)",
  );
  const selectBatch = db.prepare("SELECT * FROM contribution_batches WHERE id = ?");
  const selectRecords = db.prepare(
    "SELECT id, name, category, lat, lng, excluded, payload FROM contribution_records WHERE batch_id = ? ORDER BY rowid",
  );

  function categoriesFor(batchId: string): Record<string, number> {
    const rows = db
      .prepare("SELECT category, COUNT(*) AS n FROM contribution_records WHERE batch_id = ? GROUP BY category")
      .all(batchId) as { category: string; n: number }[];
    return Object.fromEntries(rows.map((row) => [row.category, Number(row.n)]));
  }

  function toPublic(row: Record<string, unknown>, categories?: Record<string, number>): PublicBatch {
    return {
      id: String(row.id),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      status: row.status as BatchStatus,
      recordCount: Number(row.record_count),
      sourceFormat: String(row.source_format),
      categories: categories ?? categoriesFor(String(row.id)),
    };
  }

  function toModerated(row: Record<string, unknown>): ModeratedBatch {
    const records = (selectRecords.all(String(row.id)) as Record<string, unknown>[]).map((record) => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(String(record.payload));
      } catch {
        payload = null;
      }
      return {
        id: String(record.id),
        name: String(record.name),
        category: String(record.category),
        lat: Number(record.lat),
        lng: Number(record.lng),
        excluded: Number(record.excluded) === 1,
        payload,
      };
    });
    return {
      ...toPublic(row, Object.fromEntries(records.reduce<[string, number][]>((entries, record) => {
        const existing = entries.find((entry) => entry[0] === record.category);
        if (existing) existing[1] += 1;
        else entries.push([record.category, 1]);
        return entries;
      }, []))),
      contributor: row.contributor ? String(row.contributor) : null,
      contact: row.contact ? String(row.contact) : null,
      note: row.note ? String(row.note) : null,
      reviewNote: row.review_note ? String(row.review_note) : null,
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      records,
    };
  }

  return {
    createBatch(input) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.exec("BEGIN");
      try {
        insertBatch.run(
          id,
          now,
          now,
          input.contributor,
          input.contact,
          input.note,
          input.sourceFormat,
          input.records.length,
          input.ipHash,
        );
        for (const record of input.records) {
          insertRecord.run(
            record.id,
            id,
            JSON.stringify(record),
            record.category,
            record.name,
            record.lat,
            record.lng,
          );
        }
        insertEvent.run(id, now, "submitted", `${input.records.length} record(s)`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        const message = error instanceof Error ? error.message : "unknown error";
        if (/UNIQUE constraint failed: contribution_records\.id/i.test(message)) {
          throw new StoreError("duplicate-id", "A record in this batch has an id that was already submitted.");
        }
        throw error;
      }
      const row = selectBatch.get(id) as Record<string, unknown>;
      return toPublic(row);
    },

    getPublicBatch(id) {
      const row = selectBatch.get(id) as Record<string, unknown> | undefined;
      return row ? toPublic(row) : null;
    },

    getModeratedBatch(id) {
      const row = selectBatch.get(id) as Record<string, unknown> | undefined;
      return row ? toModerated(row) : null;
    },

    listBatches({ status, limit, offset }) {
      const rows = status
        ? (db
            .prepare("SELECT * FROM contribution_batches WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .all(status, limit, offset) as Record<string, unknown>[])
        : (db
            .prepare("SELECT * FROM contribution_batches ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .all(limit, offset) as Record<string, unknown>[]);
      return rows.map(toModerated);
    },

    countsByStatus() {
      const rows = db
        .prepare("SELECT status, COUNT(*) AS n FROM contribution_batches GROUP BY status")
        .all() as { status: BatchStatus; n: number }[];
      const counts: Record<BatchStatus, number> = { pending: 0, accepted: 0, rejected: 0 };
      for (const row of rows) counts[row.status] = Number(row.n);
      return counts;
    },

    reviewBatch(id, status, note) {
      const now = new Date().toISOString();
      db.exec("BEGIN");
      try {
        db.prepare(
          "UPDATE contribution_batches SET status = ?, review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
        ).run(status, note, now, now, id);
        db.prepare("UPDATE contribution_records SET status = ? WHERE batch_id = ?").run(status, id);
        insertEvent.run(id, now, status, note);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return this.getModeratedBatch(id);
    },

    setRecordExcluded(batchId, recordId, excluded) {
      const result = db
        .prepare("UPDATE contribution_records SET excluded = ? WHERE id = ? AND batch_id = ?")
        .run(excluded ? 1 : 0, recordId, batchId);
      return Number(result.changes) > 0;
    },

    exportAccepted() {
      const rows = db
        .prepare(
          `SELECT r.payload FROM contribution_records r
           JOIN contribution_batches b ON b.id = r.batch_id
           WHERE b.status = 'accepted' AND r.excluded = 0
           ORDER BY b.created_at, r.rowid`,
        )
        .all() as { payload: string }[];
      const records: ValidatedRecord[] = [];
      for (const row of rows) {
        // Re-validate on the way out: a database row must not become published
        // data just because it was accepted once.
        const record = parseStoredRecord(row.payload);
        if (record) records.push(record);
      }
      const batchIds = (
        db.prepare("SELECT id FROM contribution_batches WHERE status = 'accepted'").all() as { id: string }[]
      ).map((row) => row.id);
      return { records, batchIds };
    },

    close() {
      db.close();
    },
  };
}
