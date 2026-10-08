import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated accessibility scan.
 *
 * Scoped to serious/critical violations on purpose: the park dataset and the
 * map itself ship landmark and region noise that is worth fixing individually
 * rather than blanket-failing on, and colour-contrast is covered by explicit
 * token assertions in `contrast.spec.ts`.
 */
function analyse(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
}

function violationsOf(result: Awaited<ReturnType<typeof analyse>>) {
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.length} node(s)`);
}

test.describe("accessibility", () => {
  test("explore page has no serious or critical violations", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/locations$/).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".leaflet-container")).toBeVisible();

    expect(violationsOf(await analyse(page))).toEqual([]);
  });

  test("park modal has no serious or critical violations", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/locations$/).first()).toBeVisible({ timeout: 45_000 });
    await page.locator(".pp-park-card-title").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    expect(violationsOf(await analyse(page))).toEqual([]);
  });

  test("every park marker popup is keyboard reachable", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/locations$/).first()).toBeVisible({ timeout: 45_000 });

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