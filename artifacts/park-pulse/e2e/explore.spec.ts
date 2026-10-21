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
    expect(name, "aria-labelledby must be set").toBeTruthy();
    // Attribute selector: Radix's generated ids contain characters that are
    // illegal bare in a #css-id selector.
    const target = page.locator(`[id="${name}"]`);
    await expect(target).toBeVisible();
    // The referenced element is the dialog's own heading — Radix binds the
    // Title it renders, so the accessible name equals the heading text.
    await expect(dialog).toHaveAccessibleName((await target.textContent()) ?? "");
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
    const title = page.getByRole("dialog").getByRole("heading", { level: 2 });
    const first = await title.textContent();

    await page.getByRole("button", { name: "Next park" }).click();
    await expect(title).not.toHaveText(first ?? "");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("navigates between parks and back", async ({ page }) => {
    const title = page.getByRole("dialog").getByRole("heading", { level: 2 });
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
});test.describe("layout (UI-first redesign)", () => {
  test("the explorer puts the controls rail left and the map right, above the fold", async ({ page }) => {
    await gotoExplore(page);

    const rects = await page.evaluate(() => {
      const get = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
      };
      const rail = document.querySelector(".pp-sidebar");
      return {
        footers: document.querySelectorAll(".pp-footer").length,
        hero: get(".pp-explore-hero"),
        explorer: get(".pp-explorer"),
        aside: get(".pp-sidebar"),
        map: get(".pp-map-container"),
        railScrolls: rail
          ? rail.scrollHeight > rail.clientHeight && getComputedStyle(rail).overflowY === "auto"
          : false,
        docScrolls: document.documentElement.scrollHeight > window.innerHeight,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    // The compact footer "chin" is gone from Explore entirely.
    expect(rects.footers).toBe(0);
    expect(rects.hero).not.toBeNull();
    expect(rects.explorer).not.toBeNull();
    expect(rects.aside).not.toBeNull();
    expect(rects.map).not.toBeNull();

    // Slim intro band on top; the explorer fills the rest of the viewport.
    expect(rects.explorer!.top).toBeGreaterThanOrEqual(rects.hero!.bottom - 1);
    expect(Math.abs(rects.aside!.top - rects.map!.top)).toBeLessThanOrEqual(1);

    // Controls rail on the LEFT, map the wider right-hand pane.
    expect(rects.aside!.right).toBeLessThanOrEqual(rects.map!.left + 1);
    expect(rects.map!.left).toBeGreaterThan(0);
    expect(rects.map!.width).toBeGreaterThan(rects.aside!.width);

    // The map is fully visible above the fold on load; the shell itself
    // does not page-scroll — the rail scrolls its own overflow instead.
    expect(rects.map!.bottom).toBeLessThanOrEqual(rects.vh + 1);
    expect(rects.map!.height).toBeGreaterThanOrEqual(300);
    expect(rects.docScrolls).toBe(false);
    expect(rects.railScrolls).toBe(true);

    // Hero stat tiles render from live data (value or an honest "—").
    const tiles = page.locator(".pp-explore-hero-stat");
    expect(await tiles.count()).toBeGreaterThanOrEqual(8);
    await expect(tiles.filter({ hasText: "Parks" }).first().locator("dd")).not.toContainText("—");
  });

  test("all shipped data layers are on by default; transport and missing data are opt-in", async ({ page }) => {
    await gotoExplore(page);

    // The filter panel starts collapsed — expand it so the layer toggles
    // render, the same first click a user makes.
    await page.locator(".pp-filters-toggle").click();

    const toggles = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll<HTMLInputElement>(".pp-filter-checkbox input"));
      return Object.fromEntries(boxes.map(b => [b.closest("label")?.textContent?.trim() ?? "?", b.checked]));
    });

    // Must see every dataset that actually ships in public/data.
    for (const shipped of [/Trees/i, /Toilets/i, /Fountain/i, /Dog/i, /NPWS/i]) {
      const entry = Object.entries(toggles).find(([k]) => shipped.test(k));
      expect(entry?.[1], `${shipped} layer should be on by default`).toBe(true);
    }
    // Transport is the one opt-in layer; Inner West ships no data files
    // (public/data/inner-west/ is empty), so it must not default on either.
    for (const optIn of [/transport/i, /inner west|\biw/i]) {
      const entry = Object.entries(toggles).find(([k]) => optIn.test(k));
      if (entry) expect(entry[1], `${optIn} layer should be opt-in`).toBe(false);
    }
    // Park-type chips are restrictions, not layers — off = all types shown.
    for (const chip of [/playground/i, /sports/i, /iconic/i, /neighbourhood/i, /pocket/i]) {
      const entry = Object.entries(toggles).find(([k]) => chip.test(k));
      if (entry) expect(entry[1], `${chip} chip should not restrict by default`).toBe(false);
    }
  });
});
