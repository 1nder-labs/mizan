/**
 * Shared E2E helpers. Sign-in retries on 429 because the dev worker's
 * better-auth rate limit is 5/min on /sign-in/email and the E2E suite
 * naturally exceeds that across files.
 */
import { expect, type Page } from "@playwright/test";

export const REVIEWER_EMAIL = "reviewer@mizan.test";
export const REVIEWER_PASSWORD = "reviewer-dev-only-12345";
export const ADMIN_EMAIL = "admin@mizan.test";
export const ADMIN_PASSWORD = "admin-dev-only-12345";

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /^Sign in$/ }).click();
    const reachedQueue = await page
      .waitForURL(/\/queue/, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (reachedQueue) return;
    const tooMany = await page
      .getByText(/too many requests/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (!tooMany && attempt === 0) {
      await expect(page).toHaveURL(/\/queue/);
      return;
    }
    await page.waitForTimeout(12_000);
  }
  await expect(page).toHaveURL(/\/queue/);
}
