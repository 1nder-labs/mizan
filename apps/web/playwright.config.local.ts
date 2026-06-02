/**
 * Local-only Playwright config that does NOT spawn webServers. Use
 * when worker (8787) + vite (5173) are already running.
 *
 * EXPLICITLY NOT WIRED INTO CI. E2E with a live worker requires
 * Cloudflare auth + Vectorize remote binding, which CI runners
 * don't have. CI runs unit + integration + contract only; this
 * config exists for local smoke / pre-merge developer validation.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
