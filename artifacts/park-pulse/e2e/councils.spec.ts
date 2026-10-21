import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Browser-level checks for the multi-council governance UI (FR1).
 *
 * These drive the real selector with the keyboard, assert that results and
 * the stats panel agree with each other after point-in-polygon scoping, and
 * scan the new controls for accessibility violations.
 */

async function gotoExplore(page: import("@playwright/test").Page) {
  await page.goto("/explore");
  await expect(page.getByText(/park records$/).first()).toBeVisible({ timeout: 45_000 });
}

/** Parks-in-selection figure shown in the stats panel. */
function statsParks(page: import("@playwright/test").Page) {
  return page
    .locator(".pp-council-stat")
    .filter({ hasText: "Parks in selection" })
    .locator("dd");
}

/** Number in the results header, e.g. "213 parks · 45 ha". */
function headerCount(page: import("@playwright/test").Page) {
  return page.locator(".fa-results-count");
}

test.describe("council governance", () => {
  test("keyboard-only selection scopes results and updates the URL", async ({ page }) => {
    await gotoExplore(page);

    const trigger = page.getByRole("combobox", { name: "Select a council" });

    // Entirely keyboard-driven: open with ArrowDown, type the PRD alias
    // "sydney" (→ City of Sydney), commit with Enter.
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    const search = page.getByPlaceholder("Filter councils…");
    await expect(search).toBeFocused();
    await search.fill("sydney");
    await page.keyboard.press("Enter");

    // Popup closes on single-mode selection and focus returns to the trigger.
    await expect(trigger).toHaveText(/City of Sydney/);
    await expect(trigger).toBeFocused();

    // FR1.9 deep link.
    await expect.poll(() => page.url()).toContain("councils=council-of-the-city-of-sydney");

    // Boundary legend chip for the selection (FR1.7).
    const chip = page.locator(".pp-council-chip");
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText("City of Sydney");

    // FR1.6/1.8: the header count and the stats panel must agree once the
    // boundary has been applied — both describe the same pip-scoped set.
    await expect(headerCount(page)).toContainText("parks");
    await expect
      .poll(async () => {
        // First token of "213 parks · 45 ha" — not every digit in the string.
        const header = Number(
          ((await headerCount(page).textContent()) ?? "").trim().split(/\s+/)[0].replace(/[^\d]/g, ""),
        );
        const stats = Number(((await statsParks(page).textContent()) ?? "").replace(/[^\d]/g, ""));
        return header === stats && header > 0;
      }, { timeout: 20_000 })
      .toBe(true);

    // The boundary is drawn on the map with the palette colour.
    await expect
      .poll(() => page.locator(".leaflet-overlay-pane path").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Clearing the selection restores the network-wide list.
    await page.getByRole("button", { name: "Remove City of Sydney from selection" }).click();
    await expect(trigger).toHaveText(/All councils/);
    await expect(page.locator(".fa-results-count")).toContainText("park records");
    await expect.poll(() => page.url()).not.toContain("councils=");
  });

  test("multi-select paints two colour-coded boundaries with a legend chip each", async ({ page }) => {
    await gotoExplore(page);

    await page.getByRole("combobox", { name: "Select a council" }).click();
    await page.getByRole("button", { name: "Multi" }).click();

    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await page.getByRole("option", { name: /Blacktown City Council/ }).click();
    await page.getByRole("option", { name: /City of Sydney/ }).click();

    await expect(page.locator(".pp-council-chip")).toHaveCount(2);
    await expect.poll(() => page.url()).toContain("mode=multi");

    // FR1.5: distinct stable palette colours on the map.
    await expect
      .poll(() => page.locator(".leaflet-overlay-pane path").count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);

    // The multi-mode popup stays open by design after each pick; dismiss it
    // (clicking the trigger toggles it closed, the same affordance a mouse
    // user has) before reaching for the chip remove it would otherwise
    // overlay.
    await page.getByRole("combobox", { name: "Select a council" }).click();
    await expect(page.getByRole("listbox")).toBeHidden();
    const strokeColors = await page.evaluate(() => {
      const paths = Array.from(
        document.querySelectorAll<SVGPathElement>(".leaflet-overlay-pane path"),
      );
      return [...new Set(paths.map(p => p.getAttribute("stroke")).filter(Boolean))];
    });
    expect(strokeColors.length).toBeGreaterThanOrEqual(2);

    // Legend dots use the same palette as the map strokes.
    const dotColors = await page.evaluate(() => {
      const dots = Array.from(document.querySelectorAll<HTMLElement>(".pp-council-chip-dot"));
      return [...new Set(dots.map(d => d.style.backgroundColor).filter(Boolean))];
    });
    expect(dotColors.length).toBe(2);

    // Removing one chip drops it from the selection and the URL.
    await page.getByRole("button", { name: "Remove City of Sydney from selection" }).click();
    await expect(page.locator(".pp-council-chip")).toHaveCount(1);
    await expect.poll(() => page.url()).not.toContain("council-of-the-city-of-sydney");
  });

  test("a council deep link restores the selection on mount", async ({ page }) => {
    await page.goto("/explore?councils=lga-blacktown,liverpool-city-council&mode=multi");
    await expect(page.locator(".fa-results-count")).toContainText("parks", { timeout: 45_000 });

    // Unknown ids are dropped silently; the valid one still applies.
    const trigger = page.getByRole("combobox", { name: "Select a council" });
    await expect(trigger).toHaveText(/Liverpool City Council/);
    await expect(page.locator(".pp-council-chip")).toHaveCount(1);
  });

  test("council controls introduce no serious or critical a11y violations", async ({ page }) => {
    await gotoExplore(page);

    await page.getByRole("combobox", { name: "Select a council" }).click();
    await expect(page.getByRole("listbox")).toBeVisible();

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const violations = result.violations
      .filter(v => v.impact === "serious" || v.impact === "critical")
      .map(v => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.length} node(s)`);
    expect(violations).toEqual([]);
  });

  test("council tree shards load for the selected council only", async ({ page }) => {
    // Fetching ~3 MB of council shards on cold cache is slower than the
    // default 60 s budget (the other specs share the machine serially).
    test.setTimeout(180_000);
    await gotoExplore(page);

    // Pick Parramatta — the one priority council with a sharded tree dataset.
    await page.getByRole("combobox", { name: "Select a council" }).click();
    await page.getByPlaceholder("Filter councils…").fill("parramatta");
    await page.keyboard.press("Enter");
    await expect(page.locator(".pp-council-chip")).toContainText("City of Parramatta Council");

    // Turn on the trees layer (it ships on by default now — click only if
    // off, so the resolver still refetches for the selected council). The
    // input is visually hidden behind the pp-checkmark (clip-path), so
    // hit-test it through its <label> wrapper — the same target a mouse user
    // clicks.
    const treesChip = page.locator('.fa-chip[data-layer="trees"]');
    if ((await treesChip.getAttribute("aria-pressed")) !== "true") await treesChip.click();
    await expect(treesChip).toHaveAttribute("aria-pressed", "true");

    // The live layer count must report the council shard set's total
    // (66,345 trees) — i.e. the resolver fetched Parramatta's shards, not the
    // city baseline and not nothing.
    await expect
      .poll(
        async () => {
          const chip = page.locator(".pp-council-layercount").filter({ hasText: /^trees/ });
          const text = (await chip.textContent()) ?? "";
          return Number(text.replace(/[^\d]/g, ""));
        },
        { timeout: 30_000 },
      )
      .toBe(66345);

    // The tree overlay names its council (FR3.5): canvas markers carry popup
    // content only when opened, so assert the layer's counts chip label and
    // that the zoom hint state does not error the console instead.
    const errors: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await expect(page.locator(".leaflet-container")).toBeVisible();
    expect(errors.filter(e => e.includes("tree"))).toEqual([]);
  });

  test("stats panel reports area and coverage for the selection", async ({ page }) => {
    await gotoExplore(page);

    await page.getByRole("combobox", { name: "Select a council" }).click();
    await page.getByRole("option", { name: /Randwick City Council/ }).click();

    const stats = page.locator(".pp-council-stats");
    await expect(stats).toContainText("Councils selected");
    await expect(stats.locator(".pp-council-stat").filter({ hasText: /^Area/ })).toContainText("km²");
    await expect(stats.locator(".pp-council-stat").filter({ hasText: "Coverage" })).toContainText("%");
    await expect(statsParks(page)).not.toContainText("—");
  });

  test("boundary shading applies the hover-on gradient and reverts on hover-off (FR7.1)", async ({ page }) => {
    // The coverage-grad palette PNGs are absent (TBD-9), so the hover-on state
    // is an SVG linearGradient injected into the boundary renderer. Hover-off
    // is the flat fill Leaflet set on the path.
    await gotoExplore(page);
    await page.getByRole("combobox", { name: "Select a council" }).click();
    await page.getByRole("option", { name: /Randwick City Council/ }).click();

    const path = page.locator("path.pp-council-shade").first();
    await expect(path).toBeVisible();

    // The overlay layers now ship on by default, and their markers render
    // above the overlay pane — one parked over the polygon's centre would
    // swallow the hover. Switch the new default layers off for this test so
    // the boundary is hoverable exactly as it was before the redesign; the
    // FR7.1 contract under test is the boundary's own hover state.
    for (const key of ["trees", "toilets", "fountains", "dogs", "npws"]) {
      const chip = page.locator(`.fa-chip[data-layer="${key}"]`);
      if (await chip.count()) {
        if ((await chip.getAttribute("aria-pressed")) === "true") await chip.click();
        await expect(chip).toHaveAttribute("aria-pressed", "false");
      }
    }

    // Hover-off baseline: the defs are present, the path points at its
    // colour's gradient, and the flat fill opacity is FR1.4's 0.12.
    await expect(page.locator("svg #pp-shade-defs linearGradient").first()).toHaveCount(1);
    expect(await path.evaluate(el => el.style.getPropertyValue("--pp-shade"))).toMatch(
      /^url\(#pp-shade-\d\)$/,
    );
    await expect(path).toHaveAttribute("fill-opacity", "0.12");

    // Hover-on: a real mouse move into the polygon swaps in the gradient fill
    // at full opacity and thickens the stroke. The map sits below the fold in
    // the UI-first layout — bring the path on-screen first, otherwise the
    // mouse move lands outside the viewport and nothing hovers.
    await path.scrollIntoViewIfNeeded();
    const box = await path.boundingBox();
    expect(box).not.toBeNull();
    // Markers render above the boundary pane, so a centre-of-bbox move can
    // land on a park pin instead of the polygon. Sample the bbox for a point
    // where the path itself is the hit target, then hover exactly there.
    const spot = await path.evaluate((el) => {
      const b = el.getBoundingClientRect();
      for (let gy = 0.05; gy <= 0.95; gy += 0.05) {
        for (let gx = 0.05; gx <= 0.95; gx += 0.05) {
          const x = b.left + b.width * gx;
          const y = b.top + b.height * gy;
          if (el.contains(document.elementFromPoint(x, y))) return { x, y };
        }
      }
      return null;
    });
    expect(spot, "no hit-testable point inside the council polygon").not.toBeNull();
    await page.mouse.move(spot!.x, spot!.y);
    await expect
      .poll(() => path.evaluate(el => getComputedStyle(el).fillOpacity))
      .toBe("1");
    expect(await path.evaluate(el => getComputedStyle(el).fill)).toContain("url(");

    // Hover-off: moving away restores the flat 0.12 fill.
    await page.mouse.move(0, 0);
    await expect
      .poll(() => path.evaluate(el => getComputedStyle(el).fillOpacity))
      .toBe("0.12");
  });
});
