import { expect, test } from "@playwright/test";
import { LAYERS } from "../src/data/layers";

/** Collect page errors and console errors; fail loudly on any. */
async function watchErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource/.test(text) && /favicon/i.test(text)) return;
    errors.push(`console.error: ${text}`);
  });
  return errors;
}

test.describe("data atlas", () => {
  test("lists every registered layer with artifact and status", async ({ page }) => {
    const errors = await watchErrors(page);
    await page.goto("/atlas");
    await expect(
      page.getByRole("heading", { name: "Every dataset, one row each.", level: 1 }),
    ).toBeVisible();

    const table = page.getByRole("table").first();
    await expect(table).toBeVisible();
    const withheld = page.locator("section", { hasText: "Withheld from this build" });
    await expect(withheld).toBeVisible();

    // Served rows (minus the header) plus withheld items cover every layer.
    const servedRows = await table.getByRole("row").count();
    const withheldItems = await withheld.getByRole("listitem").count();
    expect(servedRows - 1 + withheldItems).toBe(LAYERS.length);

    // Each registered layer appears exactly once across the two sections.
    for (const layer of LAYERS) {
      const inTable = await table.getByRole("row", { name: layer.label }).count();
      const inWithheld = await withheld.getByText(layer.label, { exact: false }).count();
      expect(inTable + Math.min(inWithheld, 1)).toBe(1);
    }

    expect(errors).toEqual([]);
  });
});

test.describe("amenities", () => {
  test("shows the six facility layers with counts and working Explore links", async ({
    page,
  }) => {
    const errors = await watchErrors(page);
    await page.goto("/amenities");
    await expect(
      page.getByRole("heading", { name: "Facilities, on their own terms.", level: 1 }),
    ).toBeVisible();

    const cards = page.locator(".fa-card");
    await expect(cards).toHaveCount(6);

    const toilets = cards.filter({ hasText: "Public toilets" });
    await expect(toilets.getByRole("link", { name: "Open in Explore" })).toHaveAttribute(
      "href",
      "/explore?filter=toilets",
    );
    // Counts come from the served snapshot, never a placeholder.
    await expect(toilets.locator(".fa-card-count")).not.toContainText("Not provided");

    expect(errors).toEqual([]);
  });
});

test.describe("compare parks", () => {
  test("searches, selects and compares published park attributes", async ({ page }) => {
    const errors = await watchErrors(page);
    await page.goto("/compare");
    await expect(
      page.getByRole("heading", { name: "Three parks, side by side.", level: 1 }),
    ).toBeVisible();

    await page.getByLabel("Find a park to compare").fill("Fitzroy");
    await expect(page.getByRole("button", { name: "Fitzroy Gardens" })).toBeVisible();
    await page.getByRole("button", { name: "Fitzroy Gardens" }).click();

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row", { name: /Recorded area/ })).toContainText("ha");

    // Removing returns to the empty state without errors.
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(table).toHaveCount(0);
    await expect(page.getByText("Nothing selected yet.")).toBeVisible();

    expect(errors).toEqual([]);
  });
});
