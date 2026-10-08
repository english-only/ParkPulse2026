const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
/**
 * Per-entry ceiling. The tree shards are the largest thing we store and the
 * sharder keeps them well under this; the check exists to stop a single
 * pathological payload from blowing the whole origin quota.
 */
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;

const CACHE_PREFIX = "pp_cache_";

interface CacheEntry<T> { data: T; ts: number }

/** Reports why an entry could not be persisted. Surfaced in the UI. */
export type CacheNotice =
  | { kind: "stored"; key: string; bytes: number }
  | { kind: "oversized"; key: string; bytes: number }
  | { kind: "quota"; key: string; bytes: number };

type NoticeListener = (notice: CacheNotice) => void;
const listeners = new Set<NoticeListener>();

/** Subscribe to cache write outcomes. Returns an unsubscribe function. */
export function onCacheNotice(fn: NoticeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(notice: CacheNotice): void {
  for (const fn of listeners) {
    try {
      fn(notice);
    } catch (err) {
      console.error("[dataCache] notice listener threw:", err);
    }
  }
}

/**
 * Real UTF-8 byte size. `String.length` counts UTF-16 code units, which
 * undercounts every non-ASCII character and made the old "bytes" limit
 * meaningless for the emoji-bearing data this app stores.
 */
function byteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
  return Buffer.byteLength(value, "utf8");
}

/**
 * Builds the caller-supplied identifier for an entry. The `pp_cache_` prefix
 * is applied by get/set rather than here, so it is impossible for a caller to
 * write outside the namespace by forgetting it.
 */
function cacheId(url: string, ns?: string): string {
  return ns ?? btoa(encodeURIComponent(url)).replace(/[^a-z0-9]/gi, "_").slice(0, 72);
}

function storageKey(cacheId_: string): string {
  return `${CACHE_PREFIX}${cacheId_}`;
}

function cacheKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
  }
  return keys;
}

/** Rough bytes currently held, used to decide whether eviction is worthwhile. */
export function cacheUsageBytes(): number {
  let total = 0;
  for (const k of cacheKeys()) {
    const raw = localStorage.getItem(k);
    if (raw) total += byteLength(raw);
  }
  return total;
}

export function getCached<T>(cacheId: string): T | null {
  const k = storageKey(cacheId);
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.ts > CACHE_TTL) {
      localStorage.removeItem(k);
      return null;
    }
    return entry.data;
  } catch (err) {
    console.warn("[dataCache] unreadable entry, dropping:", cacheId, err);
    localStorage.removeItem(k);
    return null;
  }
}

/**
 * Drop a roughly random quarter of the cached entries. Random eviction is
 * intentional: the app has no popularity signal and LRU would need access
 * timestamps we do not track. A quarter leaves headroom so this does not have
 * to run on every subsequent write.
 */
function evictSome(): boolean {
  const keys = cacheKeys();
  if (keys.length <= 1) return false;
  const drop = Math.max(1, Math.floor(keys.length / 4));
  let removed = false;
  for (let i = 0; i < drop; i++) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    if (k === undefined) break;
    localStorage.removeItem(k);
    removed = true;
  }
  return removed;
}

export function setCached<T>(cacheId: string, data: T): void {
  let serialized: string;
  try {
    serialized = JSON.stringify({ data, ts: Date.now() } as CacheEntry<T>);
  } catch (err) {
    // Circular structures or BigInt values reach here; not worth caching.
    console.warn("[dataCache] value is not serialisable, skipping cache:", cacheId, err);
    return;
  }

  const bytes = byteLength(serialized);
  if (bytes > MAX_ENTRY_BYTES) {
    emit({ kind: "oversized", key: cacheId, bytes });
    return;
  }

  // Two attempts: the first write may fail because earlier entries filled the
  // quota, the second after evicting some of them.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      localStorage.setItem(storageKey(cacheId), serialized);
      emit({ kind: "stored", key: cacheId, bytes });
      return;
    } catch (err) {
      if (attempt === 1 || !evictSome()) {
        emit({ kind: "quota", key: cacheId, bytes });
        console.warn("[dataCache] could not persist entry (quota or private mode):", cacheId, err);
        return;
      }
    }
  }
}

export function clearAllCache(): void {
  for (const k of cacheKeys()) localStorage.removeItem(k);
}

export async function fetchWithCache<T>(
  url: string,
  ns?: string,
): Promise<{ data: T; fromCache: boolean }> {
  const ck = cacheId(url, ns);
  const cached = getCached<T>(ck);
  if (cached !== null) return { data: cached, fromCache: true };
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const data = (await res.json()) as T;
  setCached(ck, data);
  return { data, fromCache: false };
}