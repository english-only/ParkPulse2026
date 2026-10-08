import { describe, expect, it, vi } from "vitest";
import {
  cacheUsageBytes,
  clearAllCache,
  fetchWithCache,
  getCached,
  onCacheNotice,
  setCached,
  type CacheNotice,
} from "./dataCache";
import { __setStorageQuota } from "../test/setup";

describe("dataCache", () => {
  it("round-trips a value", () => {
    setCached("k", { a: 1, b: "two" });
    expect(getCached("k")).toEqual({ a: 1, b: "two" });
  });

  it("returns null for a missing key", () => {
    expect(getCached("nope")).toBeNull();
  });

  it("expires entries older than the TTL", () => {
    vi.useFakeTimers();
    try {
      setCached("k", "value");
      // 7 days is the TTL; step just past it.
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1);
      expect(getCached("k")).toBeNull();
      // The expired entry is dropped rather than left to rot.
      expect(localStorage.getItem("k")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an entry just inside the TTL", () => {
    vi.useFakeTimers();
    try {
      setCached("k", "value");
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 - 1000);
      expect(getCached("k")).toBe("value");
    } finally {
      vi.useRealTimers();
    }
  });

  it("measures real UTF-8 bytes, not UTF-16 length, when enforcing the cap", () => {
    // "é" is 2 UTF-8 bytes but 1 UTF-16 code unit. A payload of these must be
    // measured as larger than its .length, otherwise the cap is a fiction.
    const payload = "é".repeat(700_000);
    expect(payload.length).toBe(700_000);
    expect(new TextEncoder().encode(payload).length).toBe(1_400_000);

    const notices: CacheNotice[] = [];
    const off = onCacheNotice((n) => notices.push(n));
    try {
      setCached("big", payload);
    } finally {
      off();
    }
    // 1.4 MB payload plus JSON envelope is under the 2 MB cap, so it stores.
    expect(notices[0]?.kind).toBe("stored");

    notices.length = 0;
    const payload2 = "é".repeat(1_500_000); // 3 MB of UTF-8
    const off2 = onCacheNotice((n) => notices.push(n));
    try {
      setCached("too-big", payload2);
    } finally {
      off2();
    }
    expect(notices[0]).toMatchObject({ kind: "oversized" });
    expect(localStorage.getItem("pp_cache_too-big")).toBeNull();
  });

  it("reports an oversized entry instead of dropping it silently", () => {
    const notices: CacheNotice[] = [];
    const off = onCacheNotice((n) => notices.push(n));
    try {
      setCached("huge", "x".repeat(3 * 1024 * 1024));
    } finally {
      off();
    }
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe("oversized");
  });

  it("evicts existing entries when the quota is hit, then retries", () => {
    const notices: CacheNotice[] = [];
    setCached("a", "A".repeat(400));
    setCached("b", "B".repeat(400));
    const before = cacheUsageBytes();
    expect(before).toBeGreaterThan(0);

    // Leave room for one of the two existing entries plus the new payload, so
    // the first write overflows and the retry after eviction succeeds.
    const singleEntry = before / 2;
    const newEntry = 500 + 64; // payload plus JSON envelope
    __setStorageQuota(Math.ceil(singleEntry + newEntry));

    const off = onCacheNotice((n) => notices.push(n));
    try {
      setCached("c", "C".repeat(500));
    } finally {
      off();
    }
    // The retry after eviction succeeded, so this reports "stored".
    expect(notices.some((n) => n.kind === "stored")).toBe(true);
    expect(getCached("c")).toBe("C".repeat(500));
    // One of the two older entries was evicted to make room.
    const survivors = [getCached("a"), getCached("b")].filter((v) => v !== null).length;
    expect(survivors).toBe(1);
  });

  it("reports a quota failure when even eviction cannot make room", () => {
    setCached("a", "A".repeat(400));
    __setStorageQuota(1);

    const notices: CacheNotice[] = [];
    const off = onCacheNotice((n) => notices.push(n));
    try {
      setCached("b", "B".repeat(500));
    } finally {
      off();
    }
    expect(notices.some((n) => n.kind === "quota")).toBe(true);
  });

  it("never lets a throwing listener break the write path", () => {
    const off = onCacheNotice(() => {
      throw new Error("listener exploded");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => setCached("k", "v")).not.toThrow();
      expect(getCached("k")).toBe("v");
    } finally {
      off();
      errSpy.mockRestore();
    }
  });

  it("skips values that cannot be serialised", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    try {
      expect(() => setCached("cycle", circular)).not.toThrow();
      expect(getCached("cycle")).toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("drops a corrupt entry rather than throwing on every read", () => {
    localStorage.setItem("pp_cache_bad", "{not json");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(getCached("bad")).toBeNull();
      expect(localStorage.getItem("pp_cache_bad")).toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("clears every namespaced key and leaves foreign keys alone", () => {
    setCached("a", 1);
    setCached("b", 2);
    localStorage.setItem("unrelated", "keep me");
    clearAllCache();
    expect(getCached("a")).toBeNull();
    expect(getCached("b")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep me");
  });

  describe("fetchWithCache", () => {
    it("fetches once then serves from cache", async () => {
      const body = { features: [1, 2, 3] };
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
      vi.stubGlobal("fetch", fetchMock);

      const first = await fetchWithCache<typeof body>("data/x.json", "ns");
      expect(first).toEqual({ data: body, fromCache: false });

      const second = await fetchWithCache<typeof body>("data/x.json", "ns");
      expect(second).toEqual({ data: body, fromCache: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it("surfaces the HTTP status when the response is not ok", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchMock);
      await expect(fetchWithCache("data/missing.json", "ns2")).rejects.toThrow("HTTP 404");
      vi.unstubAllGlobals();
    });
  });
});