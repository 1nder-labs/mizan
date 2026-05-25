/**
 * Reviewer happy-path E2E. LOCAL-ONLY — never wired into CI.
 *
 * Requires `wrangler dev` (port 8787) + vite (port 5173) running plus
 * a seeded local D1 via `bun scripts/seed-users.ts`. Run with the
 * `playwright.config.local.ts` config; the default `playwright.config.ts`
 * spawns servers via portless which is not deterministic for CI.
 *
 * Cloudflare runners don't have Vectorize remote binding access, so
 * this spec cannot run unattended. CI runs unit + integration +
 * contract only.
 */
import { expect, test } from "@playwright/test";
import { REVIEWER_EMAIL, REVIEWER_PASSWORD, signIn } from "./_helpers.ts";

test.describe("reviewer flow", () => {
  test("login -> queue -> case detail -> brief stream -> filter persists", async ({ page }) => {
    await signIn(page, REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();

    const dataRows = page.locator("tbody tr");
    await expect(dataRows.first()).toBeVisible({ timeout: 10_000 });
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThan(0);

    await dataRows.first().click();
    await expect(page).toHaveURL(/\/case\/[0-9a-f-]{36}/i);
    await expect(page.getByText("Case meta")).toBeVisible();

    const status = await page
      .getByText(/Draft|Queued|Running|Ready|Actioned|Awaiting|Failed/)
      .first()
      .textContent();
    if (status?.toLowerCase().includes("running")) {
      const streamRendered = page.getByText("Workflow", { exact: true });
      const inFlightNotice = page.getByText(/Another session is already running/i);
      await expect(streamRendered.or(inFlightNotice).first()).toBeVisible({ timeout: 15_000 });
    }

    await page.goto("/queue?status=READY_FOR_REVIEW&sort=updated_desc&page=1");
    await expect(page).toHaveURL(/status=READY_FOR_REVIEW/);
    await page.reload();
    await expect(page).toHaveURL(/status=READY_FOR_REVIEW/);
    await expect(page.getByRole("tab", { name: "Ready", selected: true })).toBeVisible();
  });
});
