const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

interface CacheEntry<T> { data: T; ts: number }

function key(url: string, ns?: string): string {
  return `pp_cache_${ns ?? btoa(encodeURIComponent(url)).replace(/[^a-z0-9]/gi, "_").slice(0, 72)}`;
}

export function getCached<T>(cacheKey: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL) { localStorage.removeItem(cacheKey); return null; }
    return entry.data;
  } catch { return null; }
}

export function setCached<T>(cacheKey: string, data: T): void {
  try {
    const serialized = JSON.stringify({ data, ts: Date.now() } as CacheEntry<T>);
    if (serialized.length > MAX_ENTRY_BYTES) return;
    localStorage.setItem(cacheKey, serialized);
  } catch {
    try {
      const evict = Object.keys(localStorage)
        .filter(k => k.startsWith("pp_cache_"))
        .sort(() => Math.random() - 0.5)[0];
      if (evict) localStorage.removeItem(evict);
      const serialized = JSON.stringify({ data, ts: Date.now() });
      if (serialized.length <= MAX_ENTRY_BYTES) localStorage.setItem(cacheKey, serialized);
    } catch {}
  }
}

export function clearAllCache(): void {
  Object.keys(localStorage).filter(k => k.startsWith("pp_cache_")).forEach(k => localStorage.removeItem(k));
}

export async function fetchWithCache<T>(
  url: string,
  ns?: string
): Promise<{ data: T; fromCache: boolean }> {
  const ck = key(url, ns);
  const cached = getCached<T>(ck);
  if (cached !== null) return { data: cached, fromCache: true };
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const data: T = await res.json();
  setCached(ck, data);
  return { data, fromCache: false };
}
