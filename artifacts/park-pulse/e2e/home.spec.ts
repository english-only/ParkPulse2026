import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { LAYERS } from "../src/data/layers";

/**
 * Acceptance checks for the redesign's first phase (PRD §10, §13, §9).
 *
 * These assert behaviour, not markup: the counts must equal the generated
 * snapshot, the landing page must not sell an unsourced number, the coverage
 * table must name every layer the registry defines, and both themes must be
 * reachable from the header.
 */

const counts = new Intl.NumberFormat("en-AU");

function statValue(page: import("@playwright/test").Page, label: string) {
  return page.locator(".fa-stat", { hasText: label }).locator(".fa-stat-value");
}

/**
 * The route body fades in and `body` fades its background; axe reads computed
 * colours, so a scan during either fade measures a colour the page never
 * displays. Wait for the finite animations to finish, then until two
 * consecutive background samples agree — the same settle rule `a11y.spec.ts`
 * uses.
 */
async function settleBackground(page: import("@playwright/test").Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );

  let last = "";
  for (let i = 0; i < 25; i++) {
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (bg === last) return;
    last = bg;
    await page.waitForTimeout(120);
  }
}

function criticalViolations(result: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.length} node(s)`);
}

test.describe("home", () => {
  test("leads with the product promise and the primary action", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find your next patch of green.");
    await expect(page.getByRole("link", { name: "Explore the map" })).toHaveAttribute(
      "href",
      "/explore",
    );
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  });

  test("removes the Quick Explore grid and the unverified counters", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Quick Explore")).toHaveCount(0);
    await expect(page.getByText(/Park of the Day/i)).toHaveCount(0);
    await expect(page.getByText(/2,000\+/)).toHaveCount(0);
    await expect(page.getByText(/live open data/i)).toHaveCount(0);
    // Five animated counters became four sourced records.
    await expect(page.locator(".fa-stat")).toHaveCount(4);
  });

  test("shows counts that match the generated snapshot", async ({ page, request }) => {
    const response = await request.get("/data/stats.json");
    expect(response.ok()).toBe(true);
    const stats = (await response.json()) as {
      parks: { total: number };
      dogs: { total: number };
      fountains: { total: number };
      npws: { total: number };
      generatedAt: string;
    };

    await page.goto("/");
    await expect(statValue(page, "City of Sydney parks")).toHaveText(counts.format(stats.parks.total));
    await expect(statValue(page, "Off-leash dog areas")).toHaveText(counts.format(stats.dogs.total));
    await expect(statValue(page, "Drinking fountains")).toHaveText(
      counts.format(stats.fountains.total),
    );
    await expect(statValue(page, "NPWS facilities")).toHaveText(counts.format(stats.npws.total));
  });

  test("explains that counts are records with differing coverage", async ({ page }) => {
    await page.goto("/");
    // Wait for the lazy Home chunk, not just the route shell.
    await expect(page.getByRole("heading", { name: "What is mapped" })).toBeVisible();
    await expect(page.getByText(/not unique places/i).first()).toBeVisible();
    await expect(page.getByText(/Coverage varies by dataset/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /See coverage and sources/i })).toHaveAttribute(
      "href",
      "/about#data",
    );
  });

  test("offers deep links that the explorer actually supports", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".fa-entry")).toHaveCount(4);
    const hrefs = await page
      .locator(".fa-entry")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(hrefs).toEqual([
      "/explore?filter=playground",
      "/explore?filter=dogs",
      "/explore?sort=size",
      "/explore?locate=1",
    ]);
  });
});

test.describe("shared shell", () => {
  test("switches between exactly two themes and persists the choice", async ({ page }) => {
    await page.goto("/");
    const group = page.getByRole("group", { name: /colour theme/i });
    await expect(group.getByRole("button")).toHaveCount(2);

    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
      .toMatch(/^(warm|night)$/);

    const inactive = group.locator('button[aria-pressed="false"]');
    await inactive.click();
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(["warm", "night"]).toContain(after);

    await page.reload();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
      .toBe(after);
  });

  test("marks the current route and reaches it from the skip link", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "About" }),
    ).toHaveAttribute("aria-current", "page");

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("#main-content")).toBeVisible();
  });

  test("mobile menu is a disclosure that Escape dismisses with focus returned", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Open menu" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Closed panel must be out of the tab order, not just hidden visually.
    const panel = page.locator("#fa-mobile-nav");
    await expect(panel).toBeHidden();

    await toggle.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(panel.getByRole("link", { name: "Insights" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#fa-mobile-nav")).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  });
});

test.describe("about and data trust", () => {
  test("lists every registry layer with publisher, coverage and licence", async ({ page }) => {
    await page.goto("/about");
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(LAYERS.length + 1);

    for (const layer of LAYERS) {
      await expect(table.getByRole("row", { name: new RegExp(layer.label) })).toHaveCount(1);
    }
    await expect(table.getByText("Review pending").first()).toBeVisible();
  });

  test("does not repeat the retired unsourced claims", async ({ page }) => {
    await page.goto("/about");
    for (const claim of ["2,000+", "29 off-leash", "6 map themes", "live open data"]) {
      await expect(page.getByText(claim, { exact: false })).toHaveCount(0);
    }
    // No remote stock photography without documented rights.
    await expect(page.locator('img[src*="unsplash"]')).toHaveCount(0);
  });

  test("gates canopy instead of publishing either disputed percentage", async ({ page }) => {
    await page.goto("/about");
    const canopyRow = page.getByRole("row", { name: /Tree canopy/ });
    await expect(canopyRow).toContainText("Not published");
    await expect(canopyRow).not.toContainText("%");
  });

  test("has no serious or critical axe violations in either theme", async ({ page }) => {
    await page.goto("/about");
    for (const theme of ["warm", "night"] as const) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
      await settleBackground(page);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(criticalViolations(result), `${theme} theme`).toEqual([]);
    }
  });

  test("paints the stored theme before the app bundle runs", async ({ page }) => {
    // The page must not flash the warm canvas at a Night Field visitor. Block
    // the bundle: the head script alone has to resolve the theme.
    await page.addInitScript(() => localStorage.setItem("parkpulse_theme", "night"));
    await page.route("**/assets/*.js", (route) => route.abort());
    await page.goto("/");

    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      "night",
    );
    expect(
      await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute("content")),
    ).toBe("#000000");
  });

  test("the header carries every destination the footer lists", async ({ page }) => {
    await page.goto("/");

    const header = page.getByRole("navigation", { name: "Primary" });
    // evaluateAll does not auto-wait; let the header render first.
    await expect(header.locator(".fa-nav-link")).toHaveCount(7);
    const headerHrefs = await header.locator(".fa-nav-link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );

    // The footer's Explore column is the product sitemap; nothing may appear
    // there that the header does not carry, or the header is a partial map.
    const footerHrefs = await page
      .locator(".fa-footer-links a[href^=\"/\"]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

    expect(headerHrefs).toEqual(["/explore", "/contribute", "/amenities", "/compare", "/atlas", "/dashboard", "/about"]);
    expect(new Set(headerHrefs)).toEqual(new Set(footerHrefs.filter((href) => href !== "/about#accessibility")));
  });

  test("the hero plate draws real park boundaries and responds to its key", async ({ page, request }) => {
    const response = await request.get("/data/hero-plate.json");
    expect(response.ok()).toBe(true);
    const data = (await response.json()) as {
      parks: { paths: string[] }[];
      types: { label: string; count: number }[];
    };
    const rings = data.parks.reduce((total, park) => total + park.paths.length, 0);
    const pocket = data.types.find((type) => type.label === "Pocket")!.count;

    await page.goto("/");

    const plate = page.locator(".fa-field");
    await expect(plate).toBeVisible();
    // Every park in the layer is drawn as one or more real rings.
    await expect(plate.locator("svg path")).toHaveCount(rings);
    await expect(plate.locator(".fa-field-head")).toContainText(`${data.parks.length} park areas`);
    await expect(plate.locator("svg")).toHaveAttribute("aria-hidden", "true");

    // No scatter, no dots: the drawing is outlines only.
    await expect(plate.locator("circle")).toHaveCount(0);

    // The map frame is square; the city inside keeps its own aspect.
    const plot = await plate.locator(".fa-field-plot").boundingBox();
    expect(plot).not.toBeNull();
    expect(Math.abs(plot!.width - plot!.height)).toBeLessThanOrEqual(1);

    // A stated ground scale draws a real bar rather than a decorative rule.
    await expect(plate.locator(".fa-field-scale")).toContainText("2 km");
    const bar = await plate.locator(".fa-field-scale-rule").boundingBox();
    expect(bar!.width).toBeGreaterThan(60);

    await plate.getByRole("button", { name: /^Pocket/ }).click();
    await expect(plate.locator(".fa-field-caption")).toContainText(
      `${pocket} of ${data.parks.length} park areas are Pocket`,
    );
    await expect(plate.locator(".fa-field-group[data-on=\"true\"]")).toHaveCount(1);

    await plate.getByRole("button", { name: /^All types/ }).click();
    await expect(plate.locator(".fa-field-caption")).toContainText("Real park boundaries");
  });

  test("does not scroll horizontally on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/", "/about"]) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${route} overflow`).toBeLessThanOrEqual(1);
    }
  });
});
