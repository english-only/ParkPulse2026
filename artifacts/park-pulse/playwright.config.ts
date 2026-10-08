import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Map tiles come from a public OSM endpoint; running specs in parallel would
  // hammer it for no benefit, and the marker-count assertions assume a quiet map.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    // The app renders its dark theme from the OS preference in a fresh profile,
    // which is the harder case for contrast; both themes are asserted anyway.
    colorScheme: "dark",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node ./scripts/shard-trees.mjs && PORT=${PORT} vite preview --config vite.config.ts --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
  },
});