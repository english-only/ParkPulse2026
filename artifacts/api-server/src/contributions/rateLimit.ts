/**
 * Small in-process rate limiter.
 *
 * Deliberately not a dependency: one API instance, one Map, a fixed window.
 * If the service is ever run as several instances this must move to a shared
 * store (Redis or the database) — the call sites would not change.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface Limiter {
  check(key: string): { allowed: boolean; retryAfterSeconds: number };
}

export function createLimiter(options: {
  windowMs: number;
  max: number;
  now?: () => number;
}): Limiter {
  const windows = new Map<string, Window>();
  const now = options.now ?? Date.now;
  let lastSweep = now();

  return {
    check(key) {
      const time = now();
      // Bound memory: drop expired windows at most once a minute.
      if (time - lastSweep > 60_000) {
        for (const [entryKey, entry] of windows) {
          if (entry.resetAt <= time) windows.delete(entryKey);
        }
        lastSweep = time;
      }
      const existing = windows.get(key);
      if (!existing || existing.resetAt <= time) {
        windows.set(key, { count: 1, resetAt: time + options.windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      existing.count += 1;
      if (existing.count > options.max) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - time) / 1000)),
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
