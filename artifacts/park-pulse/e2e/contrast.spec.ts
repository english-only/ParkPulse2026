import { expect, test } from "@playwright/test";

/**
 * Guards the colour tokens that were hand-corrected for WCAG AA during the
 * accessibility pass. The values live in CSS custom properties, so they are read
 * from the live document and the real contrast ratio is computed here rather
 * than trusting a comment next to the declaration.
 */

interface Rgb { r: number; g: number; b: number }

function parseColor(value: string): Rgb | null {
  const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Flattens a possibly translucent token against its backdrop. */
function resolve(token: string, backdrop: Rgb): Rgb {
  const rgba = token.match(/rgba?\(([^)]+)\)/);
  if (!rgba) return parseColor(token) ?? backdrop;
  const parts = rgba[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  const [r, g, b, a = 1] = parts;
  if (a >= 1) return { r, g, b };
  return {
    r: r * a + backdrop.r * (1 - a),
    g: g * a + backdrop.g * (1 - a),
    b: b * a + backdrop.b * (1 - a),
  };
}

async function readToken(page: import("@playwright/test").Page, name: string) {
  return page.evaluate((token) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    const probe = document.createElement("div");
    probe.style.color = raw;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, name);
}

async function background(page: import("@playwright/test").Page): Promise<Rgb> {
  return page.evaluate(() => {
    const raw = getComputedStyle(document.body).backgroundColor;
    const probe = document.createElement("div");
    probe.style.backgroundColor = raw;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const parts = resolved.match(/[\d.]+/g)!.map(Number);
    return { r: parts[0], g: parts[1], b: parts[2] };
  });
}

/** Tokens that previously failed AA in dark mode, now corrected. */
const REGRESSIONS: Array<{ token: string; minimum: number; label: string }> = [
  { token: "--pp-text-muted", minimum: 4.5, label: "muted body text" },
];

test.describe("colour contrast", () => {
  test("dark theme tokens meet WCAG AA against the page background", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/locations$/).first()).toBeVisible({ timeout: 45_000 });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(200);

    const backdrop = await background(page);
    for (const { token, minimum, label } of REGRESSIONS) {
      const raw = await readToken(page, token);
      const colour = resolve(raw, backdrop);
      expect(
        ratio(colour, backdrop),
        `${label} (${token} = ${raw}) needs ${minimum}:1`,
      ).toBeGreaterThanOrEqual(minimum);
    }
  });

  test("body text meets AA in the light theme too", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/locations$/).first()).toBeVisible({ timeout: 45_000 });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.waitForTimeout(200);

    const backdrop = await background(page);
    for (const { token, minimum, label } of REGRESSIONS) {
      const raw = await readToken(page, token);
      const colour = resolve(raw, backdrop);
      expect(
        ratio(colour, backdrop),
        `${label} (${token} = ${raw}) needs ${minimum}:1 in light theme`,
      ).toBeGreaterThanOrEqual(minimum);
    }
  });

  test("badge classes meet WCAG AA in dark theme", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/locations$/).first()).toBeVisible({ timeout: 45_000 });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(200);

    const backdrop = await background(page);

    // Helper to get computed color/background of first matching element
    const getElementColors = async (selector: string) => {
      return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const style = getComputedStyle(el);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
        };
      }, selector);
    };

    const badgeSelectors = [
      { selector: ".pp-size-tiny", label: "size-tiny badge" },
      { selector: ".pp-size-small", label: "size-small badge" },
      { selector: ".pp-size-med", label: "size-med badge" },
      { selector: ".pp-size-large", label: "size-large badge" },
      { selector: ".pp-size-massive", label: "size-massive badge" },
      { selector: ".pp-park-type-badge", label: "park-type-badge" },
      { selector: ".pp-facility-badge-dog", label: "facility-badge-dog" },
      { selector: ".pp-sort-btn.active", label: "sort-btn active" },
      { selector: ".pp-active-badge", label: "active-badge" },
      { selector: ".pp-quick-pill.active", label: "quick-pill active" },
    ];

    for (const { selector, label } of badgeSelectors) {
      const colors = await getElementColors(selector);
      if (!colors) {
        // Element not rendered yet (e.g., no parks loaded), skip
        continue;
      }
      const fg = resolve(colors.color, backdrop);
      const bg = resolve(colors.backgroundColor, backdrop);
      const r = ratio(fg, bg);
      expect(r, `${label} (${selector}) needs 4.5:1, got ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});