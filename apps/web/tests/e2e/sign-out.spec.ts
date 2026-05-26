/**
 * Sign-out flow: clicking the sign-out CTA in the header clears the
 * session and lands the reviewer on /login. Re-attempting to visit a
 * protected route after sign-out also bounces to /login.
 */
import { expect, test } from "@playwright/test";
import { REVIEWER_EMAIL, REVIEWER_PASSWORD, signIn } from "./_helpers.ts";

test("sign-out clears session and protects routes", async ({ page }) => {
  await signIn(page, REVIEWER_EMAIL, REVIEWER_PASSWORD);

  await page
    .getByRole("button", { name: /^Sign out$/ })
    .first()
    .click();
  const confirmButton = page.getByRole("button", { name: /^Sign out$/ }).last();
  await confirmButton.click();

  await expect(page).toHaveURL(/\/login/);

  await page.goto("/queue");
  await expect(page).toHaveURL(/\/login/);
});
