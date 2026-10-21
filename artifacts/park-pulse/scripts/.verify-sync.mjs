// One-off verification: legend ↔ rail ↔ map two-way sync + search/results sync.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

try {
await page.goto(`${BASE}/explore`);
await page.getByText(/locations$/).first().waitFor({ timeout: 45000 });

const dogMarkers = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".leaflet-marker-pane *")]
      .filter(el => (el.textContent || "").includes("🐾")).length);

// ── 1. Legend off → rail checkbox + map layer follow ──────────────────────
const baseline = await dogMarkers();
check("baseline dog markers > 0", baseline > 0, `${baseline}`);

const legendDog = page.locator('.pp-map-legend-toggle', { hasText: "Dog parks" });
check("legend row present", await legendDog.count() === 1);
await legendDog.click();
await page.waitForTimeout(700);
check("legend aria-pressed flips to false",
  (await legendDog.getAttribute("aria-pressed")) === "false");
check("dog markers removed from map", (await dogMarkers()) === 0);

await page.locator(".pp-filters-toggle").click();
const railDogLabel = page.locator("label.pp-filter-checkbox", { hasText: "Dog Parks" });
const railDog = railDogLabel.locator("input");
check("rail checkbox follows legend click", !(await railDog.isChecked()));

// ── 2. Rail on → legend + map follow (two-way source of truth) ────────────
await railDogLabel.click();
await page.waitForTimeout(700);
check("legend aria-pressed back to true",
  (await legendDog.getAttribute("aria-pressed")) === "true");
check("legend off-class cleared",
  !(await legendDog.evaluate(el => el.classList.contains("off"))));
check("dog markers return", (await dogMarkers()) > 0, `${await dogMarkers()}`);

// ── 3. Combined toggles: turn two layers off together ─────────────────────
const railToiletsLabel = page.locator("label.pp-filter-checkbox", { hasText: "Public Toilets" });
const railToilets = railToiletsLabel.locator("input");
const flushMarkers = () =>
  page.evaluate(() =>
    document.querySelectorAll(
      '.leaflet-marker-pane [style*="background:#6D597A"],' +
      '.leaflet-marker-pane [style*="background:#0077B6"]',
    ).length);
const flushBefore = await flushMarkers();
check("toilets+fountains markers exist while enabled", flushBefore > 0, `${flushBefore}`);
const toiletsOn0 = await railToilets.isChecked();
if (toiletsOn0) await railToiletsLabel.click();
const legendFountains = page.locator(".pp-map-legend-toggle", { hasText: "Fountains" });
if ((await legendFountains.getAttribute("aria-pressed")) === "true") await legendFountains.click();
await page.waitForTimeout(700);
check("toilets+fountains off → their markers gone", (await flushMarkers()) === 0);

// ── 4. Clearing filters restores everything ───────────────────────────────
await railToiletsLabel.click();
await legendFountains.click();
await page.waitForTimeout(700);
check("restoring toggles brings markers back", (await flushMarkers()) > 0, `${await flushMarkers()}`);

// ── 5. Search ↔ results ↔ map sync ────────────────────────────────────────
const countText = async () => {
  const txt = (await page.locator(".pp-results-count").first().textContent()) || "";
  const m = txt.match(/([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};
const before = await countText();
check("baseline results count", before !== null && before > 0, `${before}`);

await page.locator(".pp-search-input").fill("bondi");
await page.waitForTimeout(1400);
const after = await countText();
const chipNow = (await page.locator(".pp-results-count").first().textContent()) || "";
// Narrowed either by local matches (smaller count) or — when nothing local
// matches — by the Nominatim "Near …" fallback, which is the designed path.
const narrowed =
  (after !== null && after > 0 && after < before) || /^Near/.test(chipNow.trim());
check("search narrows/relocates the results", narrowed, `${before} → ${after ?? chipNow.trim()}`);
const titles = await page.locator(".pp-park-card-title").allTextContents();
check("search returns result cards", titles.length > 0 && titles.length <= 100, `${titles.length} cards, first: ${titles[0] ?? ""}`);

await page.locator(".pp-clear-btn").click();
await page.waitForTimeout(1400);
const restored = await countText();
check("clearing restores full results", restored === before, `${before} vs ${restored}`);

// ── 6. Result card → map selection ────────────────────────────────────────
await page.locator(".pp-park-card-title").first().click();
await page.waitForTimeout(1800);
const popupOpen = await page.evaluate(() =>
  !!document.querySelector(".leaflet-popup"));
check("clicking a result opens its map popup", popupOpen);
} catch (err) {
  check(`script completed without throwing`, false, String(err && err.message || err).split("\n")[0]);
}

// ── 7. Console hygiene ────────────────────────────────────────────────────
check("no console errors during whole run", errors.length === 0, errors.slice(0, 3).join(" | "));

process.exitCode = results.some(r => r.startsWith("FAIL")) ? 1 : 0;
console.log(results.join("\n"));
console.log(`\n${results.filter(r => r.startsWith("PASS")).length}/${results.length} passed`);
await browser.close();