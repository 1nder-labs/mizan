/**
 * Phase 7 HITL E2E. LOCAL-ONLY — never wired into CI.
 *
 * Requires `wrangler dev` + `vite` + seeded reviewer per
 * `apps/web/tests/e2e/_helpers.ts`. Run via
 * `bun --filter @mizan/web test:e2e`.
 */
import { expect, test } from "@playwright/test";
import { REVIEWER_EMAIL, REVIEWER_PASSWORD, signIn } from "./_helpers.ts";

test.describe("HITL happy path", () => {
  test("reviewer can submit an action on a suspended case", async ({ page }) => {
    await signIn(page, REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await page.goto("/queue?status=SUSPENDED_HITL");
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No SUSPENDED_HITL cases seeded locally");
    await row.click();
    await expect(page.getByRole("button", { name: /^submit$/i })).toBeVisible({ timeout: 15_000 });
    await page.getByLabelText(/^approve$/i).click();
    await page.getByRole("button", { name: /^submit$/i }).click();
    await expect(page.getByText(/action recorded/i)).toBeVisible({ timeout: 15_000 });
  });
});
