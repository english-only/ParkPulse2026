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
  await expect(page.getByText(/park records$/).first()).toBeVisible({ timeout: 45_000 });
}

/** Read a layer chip's pressed state, e.g. the "Street trees" chip. */
async function layerPressed(page: import("@playwright/test").Page, key: string) {
  return (await page.locator(`.fa-chip[data-layer="${key}"]`).getAttribute("aria-pressed")) === "true";
}

test.describe("explore page", () => {
  test("loads the parks dataset and reports the scoped park-record count", async ({ page }) => {
    await gotoExplore(page);

    // F-08: the header names one source's records (City of Sydney park
    // polygons), not an unqualified "mapped locations" total that silently
    // adds the overlapping OSM layer.
    const count = page.getByText(/^[\d,]+ park records$/).first();
    await expect
      .poll(async () => {
        const text = await count.textContent();
        return text ? Number(text.replace(/[^\d]/g, "")) : 0;
      }, { timeout: 30_000 })
      .toBeGreaterThan(400);

    // The count must match what the dataset actually holds, not a constant.
    const cards = page.locator(".fa-result");
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
    expect(["warm", "night"]).toContain(before);

    // Exactly two themes, each an explicit pressed/unpressed toggle in the header.
    const group = page.getByRole("group", { name: /colour theme/i });
    const inactive = group.locator('button[aria-pressed="false"]');
    await expect(inactive).toHaveCount(1);
    await inactive.click();

    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
      .not.toBe(before);
    await expect(group.locator('button[aria-pressed="true"]')).toHaveCount(1);
  });
});

test.describe("park modal", () => {
  test.beforeEach(async ({ page }) => {
    await gotoExplore(page);
    await page.locator(".fa-result-title").first().click();
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
    const trigger = page.locator(".fa-result-title").first();
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

test.describe("layout (field-atlas redesign)", () => {
  test("controls rail sits left of a near-square map, both visible above the fold", async ({ page }) => {
    await gotoExplore(page);

    const rects = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          left: Math.round(r.left),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      };
      const frame = document.querySelector<HTMLElement>(".fa-map-frame");
      const rail = document.querySelector<HTMLElement>(".fa-rail");
      return {
        intro: box(".fa-explore-intro"),
        grid: box(".fa-explore-grid"),
        rail: box(".fa-rail"),
        frame: box(".fa-map-frame"),
        canvas: box(".fa-map-canvas"),
        canvasAspect: (() => {
          const el = document.querySelector(".fa-map-canvas");
          if (!el) return 0;
          const r = el.getBoundingClientRect();
          return r.width / r.height;
        })(),
        railScrolls: rail ? rail.scrollHeight >= rail.clientHeight : false,
        railGutter: rail ? parseInt(getComputedStyle(rail).paddingRight, 10) || 0 : 0,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    expect(rects.intro).not.toBeNull();
    expect(rects.grid).not.toBeNull();
    expect(rects.rail).not.toBeNull();
    expect(rects.frame).not.toBeNull();
    expect(rects.canvas).not.toBeNull();

    // Two columns share one row: rail on the left, map on the right.
    expect(rects.rail!.right).toBeLessThanOrEqual(rects.frame!.left + 1);
    expect(rects.frame!.left).toBeGreaterThan(rects.rail!.left);
    expect(rects.frame!.width).toBeGreaterThan(rects.rail!.width);
    expect(Math.abs(rects.rail!.top - rects.frame!.top)).toBeLessThanOrEqual(8);

    // The map itself is square: neither a letterbox nor a tall column.
    expect(rects.canvasAspect).toBeGreaterThan(0.94);
    expect(rects.canvasAspect).toBeLessThan(1.06);
    expect(rects.frame!.height).toBeGreaterThanOrEqual(320);
    expect(rects.frame!.right).toBeLessThanOrEqual(rects.vw + 1);

    // The map is on screen when the page settles, not pushed below the fold by
    // a long stack of controls.
    expect(rects.frame!.top).toBeLessThan(rects.vh - 200);

    // Intro figures render live values from the dataset (never a bare dash).
    const figures = page.locator(".fa-explore-figures .fa-figure");
    expect(await figures.count()).toBeGreaterThanOrEqual(3);
    await expect(figures.filter({ hasText: /Parks/ }).first().locator("dd")).not.toContainText("—");
  });

  test("map key names the layers currently drawn and drops them when hidden", async ({ page }) => {
    await gotoExplore(page);
    const key = page.locator(".fa-map-key");
    await expect(key).toBeVisible();
    // Parks are always drawn; the default extra layer is off-leash areas.
    await expect(key).toContainText("Parks");
    await expect(key).toContainText("Off-leash areas");
    await expect(key.locator('.fa-key-item[data-map-layer="trees"]')).toHaveCount(0);

    // Turning a layer on adds it to the key; turning it off removes it again.
    const toilets = page.locator('.fa-chip[data-layer="toilets"]');
    await toilets.click();
    await expect(key.locator('.fa-key-item[data-map-layer="toilets"]')).toContainText("Public toilets");
    await key.locator('.fa-key-item[data-map-layer="toilets"]').click();
    await expect(key.locator('.fa-key-item[data-map-layer="toilets"]')).toHaveCount(0);
    await expect(toilets).toHaveAttribute("aria-pressed", "false");
  });

  test("quick explore is gone from the page", async ({ page }) => {
    await gotoExplore(page);
    await expect(page.getByText(/quick explore/i)).toHaveCount(0);
  });

  test("the first map shows parks and off-leash areas; heavy layers are opt-in (EXP-005)", async ({ page }) => {
    await gotoExplore(page);

    // EXP-005: the readable primary park layer and core dog areas start on.
    // Trees (48,999), toilets, fountains and NPWS would otherwise bury the
    // park layer at first paint.
    expect(await layerPressed(page, "dogs"), "off-leash areas should be on by default").toBe(true);
    for (const optIn of ["trees", "toilets", "fountains", "npws", "transport"]) {
      if (await page.locator(`.fa-chip[data-layer="${optIn}"]`).count()) {
        expect(await layerPressed(page, optIn), `${optIn} should be opt-in`).toBe(false);
      }
    }

    // Park-type chips are restrictions, not layers — off = all types shown.
    const typeChips = page.locator(".fa-chip[data-type-filter]");
    const count = await typeChips.count();
    for (let i = 0; i < count; i++) {
      await expect(typeChips.nth(i)).toHaveAttribute("aria-pressed", "false");
    }
  });

  test("every supported layer is offered as a filter and toggles real map data", async ({ page }) => {
    await gotoExplore(page);

    // Every layer the shipped data supports is reachable from the rail.
    for (const key of ["dogs", "fountains", "toilets", "npws", "transport", "trees"]) {
      await expect(page.locator(`.fa-chip[data-layer="${key}"]`)).toHaveCount(1);
    }

    // Toggling a layer flips both its chip and its map-key entry — the two
    // read the same state, so they cannot drift apart.
    const chip = page.locator('.fa-chip[data-layer="toilets"]');
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.fa-key-item[data-map-layer="toilets"]')).toHaveCount(1);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('.fa-key-item[data-map-layer="toilets"]')).toHaveCount(0);
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("leads with a sticky map and stacks the rail beneath it without overflow", async ({ page }) => {
      await gotoExplore(page);

      const m = await page.evaluate(() => {
        const box = (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
        };
        const col = document.querySelector<HTMLElement>(".fa-map-col");
        return {
          col: box(".fa-map-col"),
          rail: box(".fa-rail"),
          frame: box(".fa-map-frame"),
          canvas: box(".fa-map-canvas"),
          sticky: col ? getComputedStyle(col).position : "",
          scrollWidth: document.documentElement.scrollWidth,
          vw: window.innerWidth,
        };
      });

      expect(m.rail).not.toBeNull();
      expect(m.frame).not.toBeNull();
      // Map first, rail after it — the narrow screen keeps the map in view.
      expect(m.frame!.top).toBeLessThan(m.rail!.top);
      expect(m.sticky).toBe("sticky");
      expect(m.frame!.left).toBeGreaterThanOrEqual(0);
      expect(m.frame!.width).toBeLessThanOrEqual(m.vw);
      expect(m.canvas!.height).toBeGreaterThanOrEqual(180);
      expect(m.scrollWidth).toBeLessThanOrEqual(m.vw + 1);

      // The rail is still fully usable: search, categories and results below.
      await expect(page.locator(".fa-search-input")).toBeVisible();
      await page.locator('.fa-chip[data-layer="toilets"]').scrollIntoViewIfNeeded();
      await page.locator('.fa-chip[data-layer="toilets"]').click();
      await expect(page.locator('.fa-key-item[data-map-layer="toilets"]')).toHaveCount(1);
    });
  });
});

test.describe("explore workspace", () => {
  test("desktop keeps the map in view while the results scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoExplore(page);

    const frame = page.locator(".fa-map-frame");
    const before = await frame.boundingBox();
    expect(before).not.toBeNull();

    await page.locator(".fa-results").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(250);

    const after = await frame.boundingBox();
    expect(after).not.toBeNull();
    // The frame is sticky: it moved with the scroll only until it pinned, and
    // it is still on screen (its top sits under the header, not above zero).
    expect(after!.y).toBeGreaterThanOrEqual(60);
    expect(after!.y).toBeLessThan(before!.y);
    expect(after!.y + after!.height).toBeGreaterThan(300);
  });

  test("network-wide scope still reports its totals", async ({ page }) => {
    await gotoExplore(page);

    const totals = page.getByRole("heading", { name: "Scope totals" });
    await expect(totals).toBeVisible();

    const councils = page
      .locator(".pp-council-stat")
      .filter({ has: page.locator("dt", { hasText: /^Councils$/ }) });
    await expect(councils).toBeVisible();
    await expect(councils.locator("dd")).not.toHaveText(/^—$/);
  });

  test("the theme choice survives a reload and a route change", async ({ page }) => {
    await gotoExplore(page);
    const night = page.locator(".fa-theme-option").nth(1);
    await night.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(page.locator(".fa-theme-option").nth(1)).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/about/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");

    // And the choice is the one stored, so a reload of that route keeps it too.
    expect(await page.evaluate(() => localStorage.getItem("parkpulse_theme"))).toBe("night");
  });

  test("an empty result set explains itself and recovers", async ({ page }) => {
    await gotoExplore(page);
    const search = page.getByPlaceholder("Search parks");

    await search.fill("zzzznotapark");
    await expect(page.getByText(/No parks match/).first()).toBeVisible();
    await expect(page.locator(".fa-result")).toHaveCount(0);

    // The search field has its own clear affordance; use the empty-state one.
    await page.locator(".fa-state").getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByPlaceholder("Search parks")).toHaveValue("");
    await expect
      .poll(async () => page.locator(".fa-result").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
  });

  test("selecting a result marks that card and opens its record", async ({ page }) => {
    await gotoExplore(page);

    const card = page.locator(".fa-result").first();
    const name = (await card.locator(".fa-result-title").textContent())?.trim() ?? "";
    expect(name.length).toBeGreaterThan(0);

    await card.locator(".fa-result-title").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(name);

    // The list agrees with what was opened — exactly one card carries the state.
    await expect(page.locator('.fa-result[data-selected="true"]')).toHaveCount(1);
    await expect(page.locator('.fa-result[data-selected="true"]')).toHaveAttribute(
      "data-park-id",
      (await card.getAttribute("data-park-id")) ?? "",
    );
  });

  test("the theme switch draws icons instead of emoji", async ({ page }) => {
    await gotoExplore(page);
    const options = page.locator(".fa-theme-option");
    await expect(options).toHaveCount(2);
    for (const option of await options.all()) {
      expect(await option.locator("svg").count()).toBe(1);
      expect(((await option.textContent()) ?? "").trim()).not.toMatch(/[☀☾🌙]/u);
    }
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
    await expect(page.getByText(/park records$/).first()).toBeVisible({ timeout: 45_000 });
  });
});
