import { defineConfig, devices } from "@playwright/test";

const WORKER_URL = "http://localhost:8787";
const WEB_URL = "http://localhost:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "bun run dev",
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "bun --filter @mizan/worker dev",
      url: `${WORKER_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
