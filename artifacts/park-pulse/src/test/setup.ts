import { afterEach, vi } from "vitest";

// jsdom does not implement matchMedia, which useTheme consults for the
// system-colour preference.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// A localStorage that genuinely throws on overflow, so the cache's quota path
// is exercised for real rather than against a permissive stub.
let store = new Map<string, string>();
let quotaBytes = Infinity;

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      const size = new TextEncoder().encode(String(k) + String(v)).length;
      let total = 0;
      for (const [key, val] of store) total += new TextEncoder().encode(key + val).length;
      if (total + size > quotaBytes) {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      store.set(k, String(v));
    },
    removeItem: (k: string) => void store.delete(k),
    clear: () => void (store = new Map()),
  },
});

export function __setStorageQuota(bytes: number): void {
  quotaBytes = bytes;
}

export function __resetStorage(): void {
  store = new Map();
  quotaBytes = Infinity;
}

afterEach(() => {
  __resetStorage();
  vi.restoreAllMocks();
});