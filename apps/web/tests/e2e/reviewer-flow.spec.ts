/**
 * Reviewer happy-path E2E. Local-only — requires `wrangler dev` +
 * `vite dev` running together (Playwright `webServer` handles spin-up)
 * AND the seed script having populated the dev DB:
 *   `bun --filter @mizan/worker run` `scripts/seed-users.ts` (see repo root)
 *
 * Seeded reviewer credentials (also exposed via MIZAN_SEED_* env vars):
 *   email: reviewer@mizan.test
 *   password: reviewer-dev-only-12345 (matches scripts/seed-users.ts:38-42)
 *
 * CI does not run this spec — local-only parity with worker integration
 * tests (Cloudflare auth required for wrangler dev).
 */
import { expect, test } from "@playwright/test";

const SEED_EMAIL = process.env["MIZAN_SEED_REVIEWER_EMAIL"] ?? "reviewer@mizan.test";
const SEED_PASSWORD = process.env["MIZAN_SEED_REVIEWER_PASSWORD"] ?? "reviewer-dev-only-12345";

test.describe("reviewer flow", () => {
  test("login -> queue -> case detail -> brief stream -> filter persists", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    await page.getByLabel("Email").fill(SEED_EMAIL);
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: /^Sign in$/ }).click();

    await expect(page).toHaveURL(/\/queue/);
    await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();

    const dataRows = page.locator("tbody tr");
    await expect(dataRows.first()).toBeVisible({ timeout: 10_000 });
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThan(0);

    await dataRows.first().click();
    await expect(page).toHaveURL(/\/case\/[0-9a-f-]{36}/i);
    await expect(page.getByText("Case meta")).toBeVisible();

    const status = await page.getByText(/Draft|Queued|Running|Ready|Actioned|Awaiting|Failed/).first().textContent();
    if (status?.toLowerCase().includes("running")) {
      await expect(page.getByText("Workflow")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Brief")).toBeVisible({ timeout: 30_000 });
    }

    await page.goto("/queue?status=READY_FOR_REVIEW&sort=updated_desc&page=1");
    await expect(page).toHaveURL(/status=READY_FOR_REVIEW/);
    await page.reload();
    await expect(page).toHaveURL(/status=READY_FOR_REVIEW/);
    await expect(page.getByRole("tab", { name: "Ready", selected: true })).toBeVisible();
  });
});
