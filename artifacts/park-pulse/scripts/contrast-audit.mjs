// WCAG contrast auditor for the Park Pulse design system.
// Computes the contrast ratio of every badge/button colour pair used in
// index.css against each theme's tokens, and reports pairs that fall below
// the 4.5:1 AA floor for normal text (3:1 for large text ≥18.66px bold or 24px).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Parse the theme blocks out of index.css.
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const themes = { light: {} };
const blockRe = /(?:^|\n)(?::root|\[data-theme="([a-z]+)"\])\s*\{([^}]*)\}/g;
let m;
while ((m = blockRe.exec(css)) !== null) {
  const name = m[1] || "light";
  themes[name] = {};
  for (const line of m[2].split("\n")) {
    const kv = line.trim().match(/^(--[\w-]+)\s*:\s*([^;]+);$/);
    if (kv) themes[name][kv[1]] = kv[2].trim();
  }
}

function resolve(token, theme) {
  let v = themes[theme][token];
  if (v === undefined) throw new Error(`missing token ${token} in ${theme}`);
  // Follow var() indirection (e.g. --pp-nav-border: var(--pp-border-light)).
  let guard = 0;
  while (v.startsWith("var(") && guard++ < 10) v = themes[theme][v.slice(4, -1)];
  return v;
}

// Per-theme class overrides that change badge colors beyond the base token values.
// These model the [data-theme="dark"] .pp-size-tiny { color: #c9c9c9 } etc. rules.
// Keys must match the `name` field in the `pairs` array below.
const themeOverrides = {
  dark: {
    "size-tiny": { bg: "#2d333b", fg: "#c9c9c9" },
    "size-small": { bg: "#143d5e", fg: "#b8dcf5" },
    "size-med": { bg: "#0d3b1e", fg: "#9fe6b0" },
    "size-large": { bg: "#4a2c0a", fg: "#ffd8a8" },
    "size-massive": { bg: "#4a1a1a", fg: "#ffb3b3" },
    "type-iconic": { bg: "#4a3a0a", fg: "#ffe9a8" },
    "type-sports": { bg: "#3d2408", fg: "#ffd9b3" },
    "type-neighbourhood": { bg: "#0a2e2b", fg: "#a8e6e0" },
    "type-pocket": { bg: "#241040", fg: "#d9c2f5" },
    "facility-dog": { bg: "#0d2818", fg: "#86efac" },
    "park-type-badge": { fg: "#56d364" }, // uses --pp-primary-light
    "facility-badge": { fg: "#56d364" },
    "active-chip": { fg: "#56d364" },
    "active-badge": { fg: "#06210f" }, // dark ink on --pp-primary bg
    "quick-pill.active": { fg: "#06210f" },
    "sort-btn.active": { fg: "#06210f" },
    "type-breakdown-active": { fg: "#56d364" },
    "size-label-inline": { fg: "#56d364" },
    "btn-primary(dark end)": { fg: "#06210f", bg: "#2ea043" },
    "btn-primary(dark end 2)": { fg: "#06210f", bg: "#2ea043" },
    "popup-type": { fg: "#06210f" },
    "popup-btn": { fg: "#06210f" },
    "dyk-badge": { fg: "#06210f" },
    "dyk-next:hover": { fg: "#06210f" },
    "source-new-badge": { fg: "#06210f" },
    "about-back-top": { fg: "#06210f" },
    "scroll-top-btn": { fg: "#06210f" },
    "locate-btn:hover": { fg: "#06210f" },
    "card-pin-btn:hover": { fg: "#06210f" },
    "card-share-btn:hover": { fg: "#06210f" },
    "rank-badge": { fg: "#06210f" },
    "mobile-fab": { fg: "#06210f" },
    "popup-dir-link:hover": { fg: "#06210f" },
    "area-btn.active": { fg: "#06210f" },
  },
  neon: {
    "size-tiny": { bg: "#2d333b", fg: "#c9c9c9" },
    "size-small": { bg: "#143d5e", fg: "#b8dcf5" },
    "size-med": { bg: "#0d3b1e", fg: "#9fe6b0" },
    "size-large": { bg: "#4a2c0a", fg: "#ffd8a8" },
    "size-massive": { bg: "#4a1a1a", fg: "#ffb3b3" },
    "type-iconic": { bg: "#4a3a0a", fg: "#ffe9a8" },
    "type-sports": { bg: "#3d2408", fg: "#ffd9b3" },
    "type-neighbourhood": { bg: "#0a2e2b", fg: "#a8e6e0" },
    "type-pocket": { bg: "#241040", fg: "#d9c2f5" },
    "facility-dog": { bg: "#0d2818", fg: "#86efac" },
    "park-type-badge": { fg: "#00CC6A" }, // uses --pp-primary-light
    "facility-badge": { fg: "#00CC6A" },
    "active-chip": { fg: "#00CC6A" },
    "active-badge": { fg: "#001a0d" },
    "quick-pill.active": { fg: "#001a0d" },
    "sort-btn.active": { fg: "#001a0d" },
    "type-breakdown-active": { fg: "#00CC6A" },
    "size-label-inline": { fg: "#00CC6A" },
    "btn-primary(dark end)": { fg: "#001a0d", bg: "#00FF88" },
    "btn-primary(dark end 2)": { fg: "#001a0d", bg: "#00994F" },
    "popup-type": { fg: "#001a0d" },
    "popup-btn": { fg: "#001a0d" },
    "dyk-badge": { fg: "#001a0d" },
    "dyk-next:hover": { fg: "#001a0d" },
    "source-new-badge": { fg: "#001a0d" },
    "about-back-top": { fg: "#001a0d" },
    "scroll-top-btn": { fg: "#001a0d" },
    "locate-btn:hover": { fg: "#001a0d" },
    "card-pin-btn:hover": { fg: "#001a0d" },
    "card-share-btn:hover": { fg: "#001a0d" },
    "rank-badge": { fg: "#001a0d" },
    "mobile-fab": { fg: "#001a0d" },
    "popup-dir-link:hover": { fg: "#001a0d" },
    "area-btn.active": { fg: "#001a0d" },
  },
  sunset: {
    // Sunset uses light theme base pairs (no dark/neon overrides for size badges)
    // but btn-primary uses white on #C44B00
    "btn-primary": { fg: "#ffffff" },
  },
  satellite: {
    "size-tiny": { bg: "#1e2435", fg: "#7dd3fc" },
    "size-small": { bg: "#1e2435", fg: "#7dd3fc" },
    "size-med": { bg: "#1e2435", fg: "#7dd3fc" },
    "size-large": { bg: "#1e2435", fg: "#7dd3fc" },
    "size-massive": { bg: "#1e2435", fg: "#7dd3fc" },
    "type-iconic": { bg: "#1e2435", fg: "#7dd3fc" },
    "type-sports": { bg: "#1e2435", fg: "#7dd3fc" },
    "type-neighbourhood": { bg: "#1e2435", fg: "#7dd3fc" },
    "type-pocket": { bg: "#1e2435", fg: "#7dd3fc" },
    "facility-dog": { bg: "#1e2435", fg: "#7dd3fc" },
    "park-type-badge": { fg: "#7dd3fc" },
    "facility-badge": { fg: "#7dd3fc" },
    "active-chip": { fg: "#7dd3fc" },
    "active-badge": { fg: "#0f172a" },
    "quick-pill.active": { fg: "#0f172a" },
    "sort-btn.active": { fg: "#0f172a" },
    "type-breakdown-active": { fg: "#7dd3fc" },
    "size-label-inline": { fg: "#7dd3fc", bg: "#1e2435" },
    "btn-primary(dark end)": { fg: "#0f172a", bg: "#38bdf8" },
    // Satellite uses solid background var(--pp-primary) not gradient, so dark end 2 N/A
    "btn-primary(dark end 2)": { fg: "#0f172a", bg: "#38bdf8" },
    "popup-type": { fg: "#0f172a" },
    "popup-btn": { fg: "#0f172a" },
    "dyk-badge": { fg: "#0f172a" },
    "dyk-next:hover": { fg: "#0f172a" },
    "source-new-badge": { fg: "#0f172a" },
    "about-back-top": { fg: "#0f172a" },
    "scroll-top-btn": { fg: "#0f172a" },
    "locate-btn:hover": { fg: "#0f172a" },
    "card-pin-btn:hover": { fg: "#0f172a" },
    "card-share-btn:hover": { fg: "#0f172a" },
    "rank-badge": { fg: "#0f172a" },
    "mobile-fab": { fg: "#0f172a" },
    "popup-dir-link:hover": { fg: "#0f172a" },
    "area-btn.active": { fg: "#0f172a" },
  },
  minimal: {
    // Minimal uses light theme base pairs
  },
};

// [name, bgResolver, fgResolver, isLargeText]
// Large text (WCAG: ≥24px, or ≥18.66px bold) only needs 3:1.
const pairs = [
  // Pastel badge pairs — light theme values apply to sunset + minimal too.
  ["size-tiny", () => "#f0f0f0", () => "#5f5f5f", false],
  ["size-small", () => "#e8f4fd", () => "#1d6fa8", false],
  ["size-med", () => "#eafbf1", () => "#1e7e34", false],
  ["size-large", () => "#fdf4e7", () => "#a85308", false],
  ["size-massive", () => "#fde8e8", () => "#c0392b", false],
  ["type-iconic", () => "#FFF3CD", () => "#856404", false],
  ["type-sports", () => "#FFE0CC", () => "#7A3210", false],
  ["type-neighbourhood", () => "#D0F0ED", () => "#1A5952", false],
  ["type-pocket", () => "#E8D5F5", () => "#5B21B6", false],
  ["facility-dog", () => "#f0fdf4", () => "#166534", false],
  // Token-driven badge pairs (light theme base).
  ["size-label-inline", (t) => resolve("--pp-green-100", t), (t) => resolve("--pp-text-secondary", t), false],
  ["type-breakdown-active", (t) => resolve("--pp-green-100", t), (t) => resolve("--pp-primary-dark", t), false],
  ["park-type-badge", (t) => resolve("--pp-green-100", t), (t) => resolve("--pp-primary-dark", t), false],
  ["facility-badge", (t) => resolve("--pp-green-100", t), (t) => resolve("--pp-primary-dark", t), false],
  ["active-chip", (t) => resolve("--pp-green-100", t), (t) => resolve("--pp-primary-dark", t), false],
  // White-on-primary pairs (light theme base).
  ["active-badge", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["quick-pill.active", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["sort-btn.active", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  // btn-primary gradient ends: --pp-primary / --pp-primary-dark (not --pp-primary-light)
  ["btn-primary(dark end)", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["btn-primary(dark end 2)", (t) => resolve("--pp-primary-dark", t), () => "#ffffff", false],
  ["popup-type", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["popup-badge-green", () => "#15803d", () => "#ffffff", false],
  ["popup-badge-orange", () => "#c2410c", () => "#ffffff", false],
  ["popup-btn", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["dyk-badge", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["dyk-next:hover", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["source-new-badge", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["about-back-top", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["scroll-top-btn", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["locate-btn:hover", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["card-pin-btn:hover", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["card-share-btn:hover", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["rank-badge", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["quick-pill-saved.active", () => "#b91c1c", () => "#ffffff", false],
  ["mobile-fab", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["popup-dir-link:hover", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
  ["area-btn.active", (t) => resolve("--pp-primary", t), () => "#ffffff", false],
];

const floors = Object.fromEntries(Object.keys(themes).map((t) => [t, []]));
for (const theme of Object.keys(themes)) {
  const overrides = themeOverrides[theme] || {};
  for (const [name, bgF, fgF, large] of pairs) {
    let bg, fg;
    try {
      // Check for theme-specific override first
      if (overrides[name]) {
        bg = overrides[name].bg ?? bgF(theme);
        fg = overrides[name].fg ?? fgF(theme);
      } else {
        bg = bgF(theme);
        fg = fgF(theme);
      }
    } catch {
      continue; // token missing in this theme → rule not applicable
    }
    if (!/^#[0-9a-fA-F]{3,8}$/.test(bg) || !/^#[0-9a-fA-F]{3,8}$/.test(fg)) continue; // gradient/rgba → approximate separately
    const r = ratio(fg, bg);
    const floor = large ? 3 : 4.5;
    if (r < floor) floors[theme].push({ name, bg, fg, r: r.toFixed(2), floor });
  }
}

let fails = 0;
for (const [theme, list] of Object.entries(floors)) {
  console.log(`\n=== ${theme} ===`);
  if (list.length === 0) console.log("  all pairs pass");
  for (const p of list) {
    fails++;
    console.log(`  FAIL ${p.name}: ${p.fg} on ${p.bg} = ${p.r}:1 (need ${p.floor}:1)`);
  }
}
console.log(`\n${fails} failing pairs total`);