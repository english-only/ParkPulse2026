/**
 * Contribution API.
 *
 * Public surface:
 *   POST /api/contributions              submit a validated batch
 *   GET  /api/contributions/:id          status of one submission
 *
 * Moderation surface (requires `x-moderation-token`, timing-safe compared):
 *   GET   /api/contributions                 queue, optional ?status=
 *   PATCH /api/contributions/:id             accept or reject a batch
 *   PATCH /api/contributions/:id/records/:recordId   include/exclude a record
 *   GET   /api/contributions/export          accepted, non-excluded GeoJSON
 *
 * Nothing submitted here is published automatically. Export is a separate,
 * explicit step, and the publish script re-validates the file it is given.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  MAX_RECORDS_PER_BATCH,
  validateBatchMeta,
  validateRecord,
  type RecordIssue,
} from "../contributions/validation.js";
import { StoreError, type Store } from "../contributions/store.js";
import { createLimiter } from "../contributions/rateLimit.js";

const submitLimiter = createLimiter({ windowMs: 10 * 60_000, max: 6 });
const statusLimiter = createLimiter({ windowMs: 60_000, max: 60 });
const moderationLimiter = createLimiter({ windowMs: 60_000, max: 120 });

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function hashIp(req: Request): string {
  const salt = process.env.CONTRIBUTIONS_IP_SALT ?? "parkpulse";
  return createHash("sha256").update(`${clientKey(req)}|${salt}`).digest("hex").slice(0, 32);
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Returns true when the caller presented the moderation token. */
export function isModerator(req: Request): boolean {
  const expected = process.env.MODERATION_TOKEN;
  if (!expected) return false;
  const header = req.get("x-moderation-token");
  if (!header) return false;
  return timingSafeEqual(sha256(header), sha256(expected));
}

export function moderationConfigured(): boolean {
  return Boolean(process.env.MODERATION_TOKEN);
}

/** Express 5 types route params as string | string[]; ids are always single. */
function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function fail(res: Response, status: number, code: string, message: string, extra?: object): void {
  res.status(status).json({ error: { code, message, ...extra } });
}

function limit(res: Response, retryAfterSeconds: number): void {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  fail(res, 429, "rate-limited", "Too many requests. Try again shortly.", { retryAfterSeconds });
}

export function createContributionsRouter(store: Store): IRouter {
  const router = Router();

  /** Moderation guard. A missing token is a configuration error, not a 401. */
  const requireModerator = (req: Request, res: Response, next: () => void) => {
    if (!moderationConfigured()) {
      return fail(
        res,
        503,
        "moderation-disabled",
        "Moderation is not configured on this server. Set MODERATION_TOKEN to enable the review queue.",
      );
    }
    if (!isModerator(req)) {
      return fail(res, 401, "unauthorised", "A valid moderation token is required.");
    }
    const verdict = moderationLimiter.check(`moderation:${clientKey(req)}`);
    if (!verdict.allowed) return limit(res, verdict.retryAfterSeconds);
    return next();
  };

  // Export is declared before /:id so it is never read as a batch id.
  router.get("/contributions/export", requireModerator, (_req, res) => {
    const { records, batchIds } = store.exportAccepted();
    res.setHeader("Content-Disposition", 'attachment; filename="parkpulse-contributions.geojson"');
    res.json({
      type: "FeatureCollection",
      name: "parkpulse-contributions",
      metadata: {
        generated: new Date().toISOString(),
        publishedBatches: batchIds.length,
        records: records.length,
        licence: "See each feature's provenance.licence",
      },
      features: records.map((record) => ({
        type: "Feature",
        id: record.id,
        geometry: { type: "Point", coordinates: [record.lng, record.lat] },
        properties: {
          id: record.id,
          schemaVersion: record.schemaVersion,
          category: record.category,
          name: record.name,
          description: record.description,
          address: record.address,
          suburb: record.suburb,
          council: record.council,
          attributes: record.attributes,
          provenance: record.provenance,
          createdAt: record.createdAt,
        },
      })),
    });
  });

  router.post("/contributions", (req, res) => {
    const verdict = submitLimiter.check(`submit:${clientKey(req)}`);
    if (!verdict.allowed) return limit(res, verdict.retryAfterSeconds);

    const body = req.body as { records?: unknown; meta?: unknown; contributor?: unknown; contact?: unknown; note?: unknown };
    if (!body || typeof body !== "object") {
      return fail(res, 400, "invalid-body", "A JSON body is required.");
    }
    const records = Array.isArray(body.records) ? body.records : null;
    if (!records || records.length === 0) {
      return fail(res, 400, "no-records", "Submit at least one record.");
    }
    if (records.length > MAX_RECORDS_PER_BATCH) {
      return fail(res, 413, "too-many-records", `At most ${MAX_RECORDS_PER_BATCH} records can be submitted at once.`);
    }

    const metaInput =
      body.meta && typeof body.meta === "object"
        ? (body.meta as Record<string, unknown>)
        : { contributor: body.contributor, contact: body.contact, note: body.note, sourceFormat: "manual" };
    const { meta, issues: metaIssues } = validateBatchMeta(metaInput);
    if (metaIssues.length > 0) {
      return fail(res, 422, "invalid-meta", metaIssues.join(" "));
    }

    const accepted: ReturnType<typeof validateRecord>["record"][] = [];
    const rejected: RecordIssue[] = [];
    const seenIds = new Set<string>();
    for (const [index, candidate] of records.entries()) {
      const { record, issues } = validateRecord(candidate, index);
      if (record) {
        if (seenIds.has(record.id)) {
          rejected.push({ recordIndex: index, field: "id", message: "Duplicate record id in this batch." });
          continue;
        }
        seenIds.add(record.id);
        accepted.push(record);
      } else {
        rejected.push(...issues);
      }
    }

    if (accepted.length === 0) {
      return fail(res, 422, "no-valid-records", "None of the records passed validation.", { issues: rejected });
    }

    try {
      const batch = store.createBatch({
        records: accepted.filter((record): record is NonNullable<typeof record> => record !== null),
        contributor: meta.contributor,
        contact: meta.contact,
        note: meta.note,
        sourceFormat: meta.sourceFormat,
        ipHash: hashIp(req),
      });
      return res.status(201).json({ batch, accepted: accepted.length, rejected });
    } catch (error) {
      if (error instanceof StoreError) {
        return fail(res, 409, error.code, error.message);
      }
      throw error;
    }
  });

  router.get("/contributions/:id", (req, res) => {
    const verdict = statusLimiter.check(`status:${clientKey(req)}`);
    if (!verdict.allowed) return limit(res, verdict.retryAfterSeconds);
    const batch = store.getPublicBatch(param(req, "id"));
    if (!batch) return fail(res, 404, "not-found", "No submission with that reference.");
    res.setHeader("Cache-Control", "no-store");
    return res.json({ batch });
  });

  router.get("/contributions", requireModerator, (req, res) => {
    const status = req.query.status;
    const parsedStatus =
      status === "pending" || status === "accepted" || status === "rejected" ? status : undefined;
    if (status !== undefined && !parsedStatus) {
      return fail(res, 400, "invalid-status", "status must be pending, accepted or rejected.");
    }
    const limitParam = Number(req.query.limit ?? 50);
    const limitValue = Number.isInteger(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
    const offsetParam = Number(req.query.offset ?? 0);
    const offset = Number.isInteger(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
    const batches = store.listBatches({ status: parsedStatus, limit: limitValue, offset });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ batches, counts: store.countsByStatus() });
  });

  router.patch("/contributions/:id", requireModerator, (req, res) => {
    const body = req.body as { status?: unknown; note?: unknown };
    if (body?.status !== "accepted" && body?.status !== "rejected") {
      return fail(res, 400, "invalid-status", "status must be accepted or rejected.");
    }
    if (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 1000)) {
      return fail(res, 400, "invalid-note", "Review notes must be 1,000 characters or fewer.");
    }
    const id = param(req, "id");
    const existing = store.getPublicBatch(id);
    if (!existing) return fail(res, 404, "not-found", "No submission with that reference.");
    const batch = store.reviewBatch(id, body.status, body.note?.trim() || null);
    return res.json({ batch });
  });

  router.patch("/contributions/:id/records/:recordId", requireModerator, (req, res) => {
    const body = req.body as { excluded?: unknown };
    if (typeof body?.excluded !== "boolean") {
      return fail(res, 400, "invalid-excluded", "excluded must be true or false.");
    }
    const id = param(req, "id");
    const updated = store.setRecordExcluded(id, param(req, "recordId"), body.excluded);
    if (!updated) return fail(res, 404, "not-found", "No matching record in that batch.");
    return res.json({ batch: store.getModeratedBatch(id) });
  });

  return router;
}
