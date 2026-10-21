/**
 * Client for the contributions API.
 *
 * The app is otherwise static. This module is the only place that talks to
 * the submission service, so a deployment that does not run the API fails in
 * one predictable way: `ApiUnavailableError`, surfaced by the page as "the
 * submission service is not reachable", never as a fake success.
 */

import type { PlaceRecord } from "../data/contribution/schema";

/**
 * Empty by default: the Vite dev/preview server proxies `/api` to the API
 * service, and a same-origin deployment needs no base URL at all.
 */
const BASE = (import.meta.env.VITE_CONTRIBUTIONS_API ?? "").replace(/\/$/, "");

export interface ApiIssue {
  recordIndex: number;
  field: string;
  message: string;
}

export interface BatchSummaryResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "accepted" | "rejected";
  recordCount: number;
  sourceFormat: string;
  categories: Record<string, number>;
}

export interface ModeratedRecord {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  excluded: boolean;
  payload: unknown;
}

export interface ModeratedBatch extends BatchSummaryResponse {
  contributor: string | null;
  contact: string | null;
  note: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  records: ModeratedRecord[];
}

export class ApiError extends Error {
  status: number;
  code: string;
  issues: ApiIssue[];

  constructor(status: number, code: string, message: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("X-Moderation-Token", options.token);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(25_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiUnavailableError("The submission service did not answer in time. Try again.");
    }
    throw new ApiUnavailableError(
      "The submission service is not reachable. Your records have not been sent.",
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string; issues?: ApiIssue[] } } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "request-failed",
      body?.error?.message ?? `The submission service answered ${response.status}.`,
      body?.error?.issues ?? [],
    );
  }

  return payload as T;
}

export interface SubmitResponse {
  batch: BatchSummaryResponse;
  accepted: number;
  rejected: ApiIssue[];
}

export async function submitContributions(
  records: PlaceRecord[],
  meta: {
    contributor: string;
    contact: string;
    note: string;
    sourceFormat: string;
  },
): Promise<SubmitResponse> {
  return request<SubmitResponse>("/api/contributions", {
    method: "POST",
    body: JSON.stringify({ records, meta }),
  });
}

export async function getSubmission(id: string): Promise<BatchSummaryResponse> {
  const response = await request<{ batch: BatchSummaryResponse }>(
    `/api/contributions/${encodeURIComponent(id)}`,
  );
  return response.batch;
}

export async function listSubmissions(
  token: string,
  status?: "pending" | "accepted" | "rejected",
): Promise<{ batches: ModeratedBatch[]; counts: Record<"pending" | "accepted" | "rejected", number> }> {
  const query = status ? `?status=${status}` : "";
  return request(`/api/contributions${query}`, { token });
}

export async function reviewSubmission(
  token: string,
  id: string,
  status: "accepted" | "rejected",
  note: string,
): Promise<ModeratedBatch> {
  const response = await request<{ batch: ModeratedBatch }>(
    `/api/contributions/${encodeURIComponent(id)}`,
    { method: "PATCH", token, body: JSON.stringify({ status, note }) },
  );
  return response.batch;
}

export async function setRecordExcluded(
  token: string,
  batchId: string,
  recordId: string,
  excluded: boolean,
): Promise<ModeratedBatch> {
  const response = await request<{ batch: ModeratedBatch }>(
    `/api/contributions/${encodeURIComponent(batchId)}/records/${encodeURIComponent(recordId)}`,
    { method: "PATCH", token, body: JSON.stringify({ excluded }) },
  );
  return response.batch;
}

/** Downloads the accepted GeoJSON as a blob URL. The caller revokes it. */
export async function exportAccepted(token: string): Promise<Blob> {
  const response = await fetch(`${BASE}/api/contributions/export`, {
    headers: { "X-Moderation-Token": token, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    let message = `The export failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Keep the status-based message.
    }
    throw new ApiError(response.status, "export-failed", message);
  }
  return response.blob();
}

/** Whether the page should even offer to submit in this build. */
export const CONTRIBUTIONS_API_CONFIGURED = true;
