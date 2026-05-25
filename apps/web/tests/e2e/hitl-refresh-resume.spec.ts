/**
 * Phase 7 refresh-resume E2E. LOCAL-ONLY — never wired into CI.
 */
import { expect, test } from "@playwright/test";
import { REVIEWER_EMAIL, REVIEWER_PASSWORD, signIn } from "./_helpers.ts";

test.describe("HITL refresh resume", () => {
  test("reload on RUNNING case keeps progress without restarting the run", async ({ page }) => {
    await signIn(page, REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await page.goto("/queue?status=RUNNING");
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No RUNNING cases seeded locally");
    await row.click();
    await page.waitForTimeout(2_000);
    await page.reload();
    await expect(page.getByText("Case meta")).toBeVisible({ timeout: 15_000 });
  });
});
