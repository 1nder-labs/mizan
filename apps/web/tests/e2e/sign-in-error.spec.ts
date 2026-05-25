/**
 * Sign-in negative paths against the live worker.
 *   - short password rejected client-side, no network call
 *   - bad credentials render the destructive Alert above the form
 */
import { expect, test } from "@playwright/test";

test.describe("sign in error paths", () => {
  test("short password is rejected client-side with no network call", async ({ page }) => {
    await page.goto("/login");
    let networkHit = false;
    page.on("request", (req) => {
      if (req.url().includes("/api/auth/sign-in/email")) networkHit = true;
    });
    await page.getByLabel("Email").fill("reviewer@mizan.test");
    await page.getByLabel("Password").fill("tooshort");
    await page.getByRole("button", { name: /^Sign in$/ }).click();
    await expect(page.getByText(/at least 12 characters/i)).toBeVisible();
    expect(networkHit).toBe(false);
  });

  test("bad credentials surface server error in Alert", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("reviewer@mizan.test");
    await page.getByLabel("Password").fill("definitely-not-the-password-99");
    await page.getByRole("button", { name: /^Sign in$/ }).click();
    await expect(page.getByText(/could not sign in/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
