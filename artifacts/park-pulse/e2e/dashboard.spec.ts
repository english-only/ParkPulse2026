import { expect, test } from "@playwright/test";

/**
 * PRD Phase 6 acceptance — browser checks for the dashboard, filter grid and
 * oracle search. Everything here runs against the production build with the
 * job index deliberately empty (TBD-7), which is the state the PRD pins:
 * grid renders, gated columns show "—" and never a digit, the ToS overlay
 * gates the first search, and the page logs no console errors.
 */

const GRID_CELLS = [
  ["City & Neighborhoods", "Suburbs (list)"],
  ["Industry", "Cat level equal to one"],
  ["Disability Accessibility", "Disabled access eligible"],
  ["Metro Areas", "Suburbs (sorted dropdown)"],
  ["Employment Sector", "Government only/All"],
  ["Area-based Stats", "Level equal to one"],
] as const;

async function gotoDashboard(page: import("@playwright/test").Page) {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Council insights", level: 1 })).toBeVisible();
  // The suburb vocabulary comes from local data, so it settles quickly.
  await expect(page.getByRole("status").filter({ hasText: /Loading suburbs/ })).toHaveCount(0, {
    timeout: 15_000,
  });
  // …and the council index must be resolved before any stats assertion.
  await expect(
    page.getByRole("table", { name: "Council employment statistics (PRD FR6.4)" }).getByText("Loading…"),
  ).toHaveCount(0, { timeout: 15_000 });
}

test.describe("Phase 6 dashboard", () => {
  test("filter grid renders as 3×2 with all six cells and controls (FR6.1)", async ({ page }) => {
    await gotoDashboard(page);

    const cells = page.locator("section[aria-label$=' filter']");
    await expect(cells).toHaveCount(6);

    for (const [title, control] of GRID_CELLS) {
      const cell = cells.nth(GRID_CELLS.findIndex(c => c[0] === title));
      await expect(cell.getByRole("heading", { name: title })).toBeVisible();
      // The PRD control label is rendered as the cell's caption; in the
      // disability cell the checkbox <label> repeats the exact same string,
      // so assert on the cell's text rather than a page-wide getByText (which
      // trips Playwright's strict-mode check on two matches).
      await expect(cell).toContainText(control);
    }

    // Row-major DOM order + equal-width columns ⇒ exactly two visual rows of three.
    const boxes = [];
    for (let i = 0; i < 6; i++) {
      const box = await cells.nth(i).boundingBox();
      expect(box).not.toBeNull();
      boxes.push(box!);
    }
    const rows = new Map<number, number>();
    for (const box of boxes) {
      const y = Math.round(box.y);
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }
    expect([...rows.values()]).toEqual([3, 3]);
    // First row carries the first three titles, second row the last three.
    expect(await cells.nth(0).innerText()).toContain(GRID_CELLS[0][0]);
    expect(await cells.nth(3).innerText()).toContain(GRID_CELLS[3][0]);
  });

  test("grid controls are keyboard-operable and drive the chips row (FR6.1/FR6.3)", async ({ page }) => {
    await gotoDashboard(page);

    // Radix select: focus, open with Enter, close with Escape.
    const trigger = page.getByRole("combobox", { name: "Government only or all sectors" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();

    // Native checkbox in the suburb list: Space toggles, chip appears.
    const glebe = page.getByRole("checkbox", { name: "Glebe" });
    await glebe.focus();
    await page.keyboard.press(" ");
    await expect(glebe).toBeChecked();
    await expect(page.getByText("Suburb: Glebe")).toBeVisible();

    // Removing the chip clears the constraint.
    await page.getByRole("button", { name: "Remove filter Suburb: Glebe" }).click();
    await expect(glebe).not.toBeChecked();

    // FR6.2: suburb vocabulary is local; the shortfall is disclosed (TBD-13).
    await expect(page.getByText(/\d+ suburbs from local data/)).toBeVisible();
  });

  test("gated dashboard columns render — and never a digit while TBD-7 is open (FR6.4/FR6.5/FR6.6)", async ({ page }) => {
    await gotoDashboard(page);

    const stats = page.getByRole("table", { name: "Council employment statistics (PRD FR6.4)" });
    const rows = stats.locator("tbody tr");
    await expect(rows).toHaveCount(1); // no selection → network scope row

    const cells = rows.first().locator("td");
    await expect(cells).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const text = ((await cells.nth(i).textContent()) ?? "").trim();
      expect(text).toBe("—"); // no digit may appear in a gated column
      expect(text).not.toMatch(/\d/);
    }

    // FR6.5: the chart is hidden entirely while job_openings is null.
    await expect(page.locator("section[aria-label='Sector distribution']")).toHaveCount(0);

    // FR6.6: campuses named, every value null-gated.
    const affinity = page.locator("section[aria-label='University affinity']");
    await expect(affinity).toBeVisible();
    const affinityCells = affinity.locator("tbody td");
    expect(await affinityCells.count()).toBeGreaterThan(0);
    for (const text of await affinityCells.allInnerTexts()) {
      expect(text.trim()).toBe("—");
    }
  });

  test("first search is gated by the ToS overlay and the flag persists (FR6.8)", async ({ page }) => {
    await gotoDashboard(page);

    await page.locator("#pp-oracle-query").fill("nurse");
    await page.getByRole("button", { name: "Search" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Terms of Service/)).toBeVisible();

    await dialog.getByRole("button", { name: "Accept and search" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("No listings match")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("pp_oracle_tos_accepted"))).toBe("accepted");

    // Second run goes straight through — no overlay.
    await page.locator("#pp-oracle-query").fill("engineer");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("No listings match")).toBeVisible();
  });

  test("council scope composes with the shared deep link (FR6.3)", async ({ page }) => {
    await page.goto("/dashboard?councils=council-of-the-city-of-sydney&mode=multi");
    await expect(page.getByRole("heading", { name: "Council insights", level: 1 })).toBeVisible();

    // The selected council shows up in the chips AND as the stats row label.
    await expect(page.getByText("City of Sydney").first()).toBeVisible();
    const row = page
      .getByRole("table", { name: "Council employment statistics (PRD FR6.4)" })
      .locator("tbody tr");
    await expect(row).toHaveCount(1);
    await expect(row.first().locator("th")).toHaveText("City of Sydney");

    // Removing the chip resets scope to network-wide and clears the param.
    await page.getByRole("button", { name: "Remove filter City of Sydney" }).click();
    await expect(page.getByText("All councils (network)")).toBeVisible();
    expect(page.url()).not.toContain("councils=");
  });

  test("the dashboard logs no console errors while loading (acceptance #2)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", err => errors.push(`pageerror: ${err.message}`));
    page.on("console", message => {
      if (message.type() !== "error") return;
      const text = message.text();
      // Missing favicon-class resources are infrastructure noise, not app errors.
      if (/Failed to load resource/.test(text) && /favicon/i.test(text)) return;
      errors.push(`console.error: ${text}`);
    });

    await gotoDashboard(page);
    await page.locator("#pp-oracle-query").fill("teacher");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    expect(errors).toEqual([]);
  });
});
