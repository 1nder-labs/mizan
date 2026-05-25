/**
 * Phase 7 admin audit E2E. LOCAL-ONLY — never wired into CI.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, signIn } from "./_helpers.ts";

test.describe("admin audit list", () => {
  test("admin sees populated audit feed", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: /audit log/i })).toBeVisible();
    await expect(page.getByText(/reviewer actions across all cases/i)).toBeVisible();
  });
});
