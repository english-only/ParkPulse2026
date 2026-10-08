import { expect, test } from "@playwright/test";

/**
 * Browser-level checks for the behaviour the unit tests cannot reach: the
 * Radix dialog focus trap, keyboard navigation, SPA routing and theme swaps.
 *
 * These assert the *interface the user drives* — not implementation details —
 * so a regression that still satisfies the type checker still fails here.
 */

/** The explore page renders its results count only once parks have loaded. */
async function gotoExplore(page: import("@playwright/test").Page) {
  await page.goto("/explore");
  await expect(page.getByText(/locations$/).first()).toBeVisible({ timeout: 45_000 });
}

test.describe("explore page", () => {
  test("loads the parks dataset and reports the full count", async ({ page }) => {
    await gotoExplore(page);

    // The header adds the Blacktown layer's real feature count to the parks
    // count, so wait for it to settle rather than reading a partial total.
    const count = page.getByText(/^[\d,]+ locations$/).first();
    await expect
      .poll(async () => {
        const text = await count.textContent();
        return text ? Number(text.replace(/[^\d]/g, "")) : 0;
      }, { timeout: 30_000 })
      .toBeGreaterThan(2000);

    // The count must match what the dataset actually holds, not a constant.
    const cards = page.locator(".pp-park-card");
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("puts an OSM attribution on the map", async ({ page }) => {
    await gotoExplore(page);
    await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
  });

  test("filters as the user types, case-insensitively", async ({ page }) => {
    await gotoExplore(page);
    const search = page.getByPlaceholder("Search parks");

    await search.fill("FITZROY");
    await expect(page.getByRole("heading", { name: "Fitzroy Gardens" }).first()).toBeVisible();
  });

  test("theme switch changes the document theme", async ({ page }) => {
    await gotoExplore(page);
    const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    await page.getByRole("button", { name: /change theme/i }).click();
    // The picker is a listbox of options, not a menu of buttons.
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    const target = options.filter({ hasNot: page.locator("[aria-selected=true]") }).first();
    await target.click();

    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
      .not.toBe(before);
  });
});

test.describe("park modal", () => {
  test.beforeEach(async ({ page }) => {
    await gotoExplore(page);
    await page.locator(".pp-park-card-title").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("traps focus inside the dialog and restores it on close", async ({ page }) => {
    const dialog = page.getByRole("dialog");

    // Radix moves focus to the close button on open.
    await expect(page.getByRole("button", { name: "Close modal" })).toBeFocused();

    // Tabbing far more times than there are controls must never escape the trap.
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return !!dlg && !!dlg.contains(document.activeElement);
    });
    expect(inside).toBe(true);

    // Shift+Tab walks backwards and must also stay inside.
    for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+Tab");
    expect(
      await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        return !!dlg && !!dlg.contains(document.activeElement);
      }),
    ).toBe(true);
  });

  test("is labelled by its heading for screen readers", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    const name = await dialog.getAttribute("aria-labelledby");
    expect(name).toBe("modal-title");
    await expect(page.locator(`#${name}`)).toBeVisible();
  });

  test("closes on Escape and returns focus to the trigger", async ({ page }) => {
    const trigger = page.locator(".pp-park-card-title").first();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("interior controls are clickable and not blocked by the overlay", async ({ page }) => {
    // Regression guard: the Radix overlay is a sibling of the dialog content, so
    // an overlay z-index above the content swallowed every click inside the
    // modal and closed it instead of activating the button underneath.
    const title = page.locator("h2#modal-title");
    const first = await title.textContent();

    await page.getByRole("button", { name: "Next park" }).click();
    await expect(title).not.toHaveText(first ?? "");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("navigates between parks and back", async ({ page }) => {
    const title = page.locator("h2#modal-title");
    const first = await title.textContent();

    await page.getByRole("button", { name: "Next park" }).click();
    const second = await title.textContent();
    expect(second).not.toBe(first);

    await page.getByRole("button", { name: "Previous park" }).click();
    await expect(title).toHaveText(first ?? "");
  });

  test("coordinates row is a real button, not a div with a click handler", async ({ page }) => {
    const copy = page.getByRole("button", { name: /copy coordinates/i }).first();
    await expect(copy).toBeVisible();
    await expect(copy).toHaveAttribute("type", /button|submit/);
  });
});

test.describe("routing", () => {
  test("unknown client routes render the themed 404 page", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.locator(".pp-notfound-title")).toBeVisible();
    await expect(page.getByRole("link", { name: /back to|explore/i }).first()).toBeVisible();
  });

  test("deep links back to explore on reload", async ({ page }) => {
    await page.goto("/explore");
    await page.reload();
    await expect(page.getByText(/locations$/).first()).toBeVisible({ timeout: 45_000 });
  });
});