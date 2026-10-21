// One-off: every route loads, no console errors, no horizontal overflow,
// nav + h1 present — at desktop, tablet, and phone widths.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const results = [];
const check = (name, ok, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);

const ROUTES = [
  { path: "/", name: "home", h1: true, footer: true },
  { path: "/explore", name: "explore", h1: true, footer: false },
  { path: "/dashboard", name: "dashboard", h1: true, footer: true },
  { path: "/about", name: "about", h1: true, footer: true },
  { path: "/no-such-page", name: "404", h1: false, footer: true },
];
const VIEWPORTS = [
  { label: "desktop 1280x720", width: 1280, height: 720 },
  { label: "tablet 820x1180", width: 820, height: 1180 },
  { label: "phone 390x844", width: 390, height: 844 },
];

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const route of ROUTES) {
      const errors = [];
      const onConsole = (m) => { if (m.type() === "error") errors.push(m.text()); };
      const onPageErr = (e) => errors.push(String(e));
      page.on("console", onConsole);
      page.on("pageerror", onPageErr);

      await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
      if (route.path === "/explore") {
        await page.getByText(/locations$/).first().waitFor({ timeout: 45000 }).catch(() => {});
      } else {
        await page.waitForTimeout(1200);
      }

      const m = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        h1: document.querySelectorAll("h1").length,
        nav: !!document.querySelector("header, .pp-header"),
        footer: !!document.querySelector(".pp-footer"),
        empty: (document.body.innerText || "").trim().length < 40,
      }));

      const tag = `${route.name} @ ${vp.label}`;
      check(`${tag}: no horizontal overflow`, m.overflowX <= 1, `excess=${m.overflowX}px`);
      check(`${tag}: nav present`, m.nav);
      if (route.h1) check(`${tag}: has h1`, m.h1 >= 1, `count=${m.h1}`);
      if (route.footer) check(`${tag}: footer present`, m.footer);
      check(`${tag}: body not empty`, !m.empty);
      check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 2).join(" | "));

      page.off("console", onConsole);
      page.off("pageerror", onPageErr);
    }
  }

  // Explore-specific responsive composition:
  // desktop = rail left + map right, both in viewport; stacked below 901px
  // with the document scrolling naturally.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${BASE}/explore`);
  await page.getByText(/locations$/).first().waitFor({ timeout: 45000 }).catch(() => {});
  const d = await page.evaluate(() => {
    const g = (s) => document.querySelector(s)?.getBoundingClientRect();
    return { rail: g(".pp-sidebar"), map: g(".pp-map-container"), vh: window.innerHeight };
  });
  if (d.rail && d.map) {
    check("desktop: map right of rail", d.map.left >= d.rail.right - 1);
    check("desktop: map fully above fold", d.map.bottom <= d.vh + 1, `bottom=${Math.round(d.map.bottom)}/${d.vh}`);
    check("desktop: map substantial (>=300px tall)", d.map.height >= 300, `h=${Math.round(d.map.height)}`);
  } else check("desktop explorer geometry present", false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  const p = await page.evaluate(() => {
    const g = (s) => document.querySelector(s)?.getBoundingClientRect();
    const rail = g(".pp-sidebar"), map = g(".pp-map-container");
    return {
      stacked: rail && map ? map.top >= rail.bottom - 1 : false,
      sideBySide: rail && map ? map.left >= rail.right - 1 : false,
      docScrolls: document.documentElement.scrollHeight > window.innerHeight,
      fabBefore: !!document.querySelector(".pp-mobile-fab"),
    };
  });
  check("phone: explorer stacks (map below rail)", p.stacked, `sideBySide=${p.sideBySide}`);
  check("phone: document scrolls", p.docScrolls);
  check("phone: no FAB while rail is visible", !p.fabBefore);
  // Collapsing the rail must reveal the mobile FAB.
  await page.locator(".pp-sidebar-toggle").click();
  await page.waitForTimeout(500);
  const fabVisible = await page.evaluate(() => {
    const el = document.querySelector(".pp-mobile-fab");
    return !!el && getComputedStyle(el).display === "flex";
  });
  check("phone: FAB appears when rail collapsed", fabVisible);
} catch (err) {
  check("probe completed", false, String(err && err.message || err).split("\n")[0]);
}

console.log(results.join("\n"));
console.log(`\n${results.filter(r => r.startsWith("PASS")).length}/${results.length} passed`);
await browser.close();
process.exit(results.some(r => r.startsWith("FAIL")) ? 1 : 0);