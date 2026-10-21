import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bboxOfGeometry, pointInCouncil, type CouncilGeometry } from "../src/utils/councils";

/**
 * Browser checks for the GTFS transit integration (FR4.4 / FR4.5).
 *
 * The pip reference is computed here in Node directly from the shipped
 * stops.geojson and the shipped council boundary, so the assertion compares
 * the browser against the data rather than against the app's own rendering.
 * (The point-in-polygon algorithm itself is covered by councils.test.ts.)
 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LGA = "council-of-the-city-of-sydney";

function councilGeometry(): CouncilGeometry {
  const raw = JSON.parse(
    readFileSync(path.join(PROJECT_ROOT, "public/data/boundaries/councils", `${LGA}.geojson`), "utf8"),
  );
  return (raw.geometry ?? raw) as CouncilGeometry;
}

/** How many stops the converted feed holds in total (network-wide row). */
function stopCount(): number {
  const stops = JSON.parse(
    readFileSync(path.join(PROJECT_ROOT, "public/data/transport/stops.geojson"), "utf8"),
  );
  return (stops.features ?? []).length;
}

/** How many converted stops fall inside the selected council. */
function pipReference(): number {
  const geometry = councilGeometry();
  const bbox = bboxOfGeometry(geometry);
  const stops = JSON.parse(
    readFileSync(path.join(PROJECT_ROOT, "public/data/transport/stops.geojson"), "utf8"),
  );
  let count = 0;
  for (const feature of stops.features ?? []) {
    const coords: unknown = feature?.geometry?.coordinates;
    if (!Array.isArray(coords)) continue;
    const [lng, lat] = coords as number[];
    if (typeof lng === "number" && typeof lat === "number" && pointInCouncil(geometry, lng, lat, bbox)) {
      count++;
    }
  }
  return count;
}

test.describe("transit integration (Phase 4)", () => {
  test("transport layer renders only in-council stops and the stat matches the pip reference", async ({
    page,
  }) => {
    // First run downloads stops.geojson (5.9 MB) through the preview server
    // and parses it twice (layer + stats), well past the 60 s default.
    test.setTimeout(180_000);

    const reference = pipReference();
    expect(reference).toBeGreaterThan(0);

    await page.goto(`/explore?councils=${LGA}`);
    await expect(page.locator(".fa-results-count")).toContainText("parks", { timeout: 45_000 });

    // The stats row (FR4.5) must equal the independent pip run even before the
    // layer is toggled — selecting a council is what loads stop data.
    const transitRow = page
      .locator(".pp-council-stat")
      .filter({ hasText: "Transit stops in selection" })
      .locator("dd");
    await expect
      .poll(async () => Number(((await transitRow.textContent()) ?? "").replace(/[^\d]/g, "")), {
        timeout: 45_000,
      })
      .toBe(reference);

    // Turn the transport layer on through its chip in the categorise panel.
    const transportChip = page.locator('.fa-chip[data-layer="transport"]');
    if ((await transportChip.getAttribute("aria-pressed")) !== "true") await transportChip.click();
    await expect(transportChip).toHaveAttribute("aria-pressed", "true");

    // FR4.4: rendered stop markers exist and every one of them is inside the
    // selected council (markers carry data-pp-lat/lng for exactly this check).
    await expect
      .poll(() => page.locator(".leaflet-marker-icon[data-pp-stop-id]").count(), { timeout: 45_000 })
      .toBeGreaterThan(0);

    const rendered = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".leaflet-marker-icon[data-pp-stop-id]")).map(el => ({
        lat: Number(el.dataset.ppLat),
        lng: Number(el.dataset.ppLng),
      })),
    );
    const geometry = councilGeometry();
    const bbox = bboxOfGeometry(geometry);
    const outside = rendered.filter(
      p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !pointInCouncil(geometry, p.lng, p.lat, bbox),
    );
    expect(outside).toEqual([]);

    // The layer badge reports the dataset total (the whole converted feed),
    // which is independent of viewport culling and of the selection.
    const badge = page.locator(".pp-council-layercount").filter({ hasText: /^transport/ });
    await expect
      .poll(async () => Number(((await badge.textContent()) ?? "").replace(/[^\d]/g, "")), { timeout: 45_000 })
      .toBeGreaterThan(reference);
  });

  test("deselecting the council restores the network-wide transit count", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(`/explore?councils=${LGA}`);
    await expect(page.locator(".pp-council-chip")).toContainText("City of Sydney", { timeout: 45_000 });

    await page.getByRole("button", { name: "Remove City of Sydney from selection" }).click();

    // Back to network-wide scope: the row label drops the scoping suffix and
    // reports every converted stop in the feed.
    const row = page
      .locator(".pp-council-stat")
      .filter({ has: page.locator("dt", { hasText: /^Transit stops$/ }) });
    await expect(row).toBeVisible();
    const networkCount = Number(((await row.locator("dd").textContent()) ?? "").replace(/[^\d]/g, ""));
    expect(networkCount).toBe(stopCount());
    expect(networkCount).toBeGreaterThanOrEqual(pipReference());
  });
});
