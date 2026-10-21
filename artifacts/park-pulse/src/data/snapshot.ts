import { useCallback, useEffect, useState } from "react";

/**
 * Validated read of the generated data snapshot.
 *
 * `stats.json` and `meta.json` are build outputs, not trusted constants: a
 * partial build, a stale file or a hand edit must degrade to "Not provided"
 * rather than to a plausible-looking number. Everything here is parsed
 * defensively and the raw files are never rendered directly.
 */

const BASE = import.meta.env.BASE_URL;

export interface ParkTypeCount {
  label: string;
  count: number;
}

export interface DataSnapshot {
  /** Date the served files were generated. ISO `YYYY-MM-DD`, or null. */
  generatedAt: string | null;
  /** Date the underlying observation is attributed to, or null. */
  dataLastUpdated: string | null;
  /** Flattened counts keyed by dot path, e.g. `"parks.total"`. */
  counts: Readonly<Record<string, number>>;
  parkTypes: readonly ParkTypeCount[];
  playgrounds: number | null;
  parkAreaHa: number | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

/** Non-negative integers only. Anything else is treated as absent. */
function readCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Flattens the known count paths. Each path is read explicitly rather than by
 * walking the whole file, so an unexpected key cannot leak into the UI as a
 * statistic nobody validated.
 */
const COUNT_PATHS = [
  "parks.total",
  "parks.playgrounds",
  "parks.areaHa",
  "blacktown.total",
  "dogs.total",
  "fountains.total",
  "toilets.total",
  "npws.total",
  "trees.total",
  "transport.stops",
  "councils.total",
] as const;

function readPath(root: Record<string, unknown>, path: string): number | null {
  const [group, key] = path.split(".");
  const parent = asRecord(root[group]);
  if (!parent) return null;
  return readCount(parent[key]);
}

function readParkTypes(root: Record<string, unknown>): ParkTypeCount[] {
  const parks = asRecord(root.parks);
  const byType = parks ? asRecord(parks.byType) : null;
  if (!byType) return [];
  return Object.entries(byType)
    .map(([label, value]) => ({ label, count: readCount(value) }))
    .filter((entry): entry is ParkTypeCount => entry.count !== null)
    .sort((a, b) => b.count - a.count);
}

/**
 * Returns null only when the stats file is not an object at all. A readable
 * file with missing or invalid fields still yields a snapshot whose absent
 * values are null, so the page can say what it does not know.
 */
export function parseSnapshot(rawStats: unknown, rawMeta: unknown): DataSnapshot | null {
  const stats = asRecord(rawStats);
  if (!stats) return null;

  const meta = asRecord(rawMeta);
  const counts: Record<string, number> = {};
  for (const path of COUNT_PATHS) {
    const value = readPath(stats, path);
    if (value !== null) counts[path] = value;
  }

  return {
    generatedAt: readIsoDate(stats.generatedAt) ?? (meta ? readIsoDate(meta.lastUpdated) : null),
    dataLastUpdated:
      readIsoDate(stats.dataLastUpdated) ?? (meta ? readIsoDate(meta.lastUpdated) : null),
    counts,
    parkTypes: readParkTypes(stats),
    playgrounds: readCount(counts["parks.playgrounds"]),
    parkAreaHa: readCount(counts["parks.areaHa"]),
  };
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

/** Fetches and validates both generated files. Rejects on network/parse failure. */
export async function loadSnapshot(signal: AbortSignal): Promise<DataSnapshot> {
  const [stats, meta] = await Promise.all([
    fetchJson(`${BASE}data/stats.json`, signal),
    // meta.json only carries fallback dates; its absence must not blank the page.
    fetchJson(`${BASE}data/meta.json`, signal).catch(() => null),
  ]);
  const snapshot = parseSnapshot(stats, meta);
  if (!snapshot) throw new Error("stats.json is not a JSON object");
  return snapshot;
}

export type SnapshotState =
  | { status: "loading" }
  | { status: "ready"; snapshot: DataSnapshot }
  | { status: "error"; message: string };

export function useDataSnapshot(): SnapshotState & { reload: () => void } {
  const [state, setState] = useState<SnapshotState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });

    loadSnapshot(controller.signal)
      .then((snapshot) => {
        if (active) setState({ status: "ready", snapshot });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Unknown error";
        setState({ status: "error", message });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, reload };
}

/** "2 May 2026" — or null so callers can omit the date entirely. */
export function formatSnapshotDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
