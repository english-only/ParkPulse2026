import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Automated accessibility scan.
 *
 * Scoped to serious/critical violations on purpose: the park dataset and the
 * map itself ship landmark and region noise that is worth fixing individually
 * rather than blanket-failing on, and colour-contrast is covered by explicit
 * token assertions in `contrast.spec.ts`.
 */
function scan(page: Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
}

/**
 * Wait until transient page-wide motion has finished before measuring.
 *
 * `.pp-route-loader` is a fixed, full-page overlay painted with `--pp-bg` that
 * fades out over 200 ms after a lazy route resolves. Axe reads computed
 * colours, so a scan taken mid-fade measures the overlay blended over the page
 * and intermittently reports contrast violations that do not exist in the
 * settled UI. Infinite decorative animations (pulse rings, shimmer) never
 * finish and are excluded rather than awaited.
 */
async function settlePage(page: Page) {
  await page
    .locator(".pp-route-loader")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => undefined);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function analyse(page: Page) {
  await settlePage(page);
  return scan(page);
}

/**
 * Wait for an element's running animations to finish before measuring.
 *
 * The park modal animates in (`.pp-modal-content`, opacity + scale, 250 ms).
 * Axe samples the colours it finds, so scanning mid-fade reads a blended
 * colour and intermittently reports a contrast violation that does not exist
 * in the settled UI. Waiting on the actual animations keeps the assertion
 * strict and the result deterministic.
 */
async function settled(element: Locator) {
  await element.evaluate((node) =>
    Promise.all(
      node
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

function violationsOf(result: Awaited<ReturnType<typeof analyse>>) {
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.length} node(s)`);
}

test.describe("accessibility", () => {
  test("explore page has no serious or critical violations", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/park records$/).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".leaflet-container")).toBeVisible();

    expect(violationsOf(await analyse(page))).toEqual([]);
  });

  for (const theme of ["warm", "night"] as const) {
    test(`park modal has no serious or critical violations (${theme})`, async ({ page }) => {
      // The Night Field modal is the one surface where a light-theme badge can
      // keep dark ink on a dark background and disappear; scan both themes.
      await page.addInitScript((value) => localStorage.setItem("parkpulse_theme", value), theme);
      await page.goto("/explore");
      await expect(page.getByText(/park records$/).first()).toBeVisible({ timeout: 45_000 });
      await page.locator(".fa-result-title").first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await settled(dialog);

      expect(violationsOf(await analyse(page)), theme).toEqual([]);
    });
  }

  test("dashboard has no serious or critical violations", async ({ page }) => {
    // PRD Phase 6 / FR7.4: the non-Explore surface (vendored shadcn controls,
    // filter grid, stats table) must clear the same axe bar.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Council insights", level: 1 })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Loading suburbs/ })).toHaveCount(0, {
      timeout: 15_000,
    });

    expect(violationsOf(await analyse(page))).toEqual([]);
  });

  test("every park marker popup is keyboard reachable", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/park records$/).first()).toBeVisible({ timeout: 45_000 });

    // Marker icons are Leaflet divs; the popup content they open must contain no
    // element that is focusable but unnamed, which is the classic XSS-and-a11y
    // hole in hand-built popup HTML. `title` counts as an accessible name.
    const unnamed = await page.evaluate(() => {
      const problems: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("[tabindex], a[href], button"))) {
        const name = (
          el.getAttribute("aria-label") ||
          el.textContent ||
          el.getAttribute("title") ||
          ""
        ).trim();
        if (!name) problems.push(el.className || el.tagName);
      }
      return problems;
    });
    expect(unnamed).toEqual([]);
  });
});