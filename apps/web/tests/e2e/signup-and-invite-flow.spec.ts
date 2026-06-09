/**
 * Signup + invite flow E2E. LOCAL-ONLY — requires wrangler dev + vite + seeded D1.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, signIn } from "./_helpers.ts";

test.describe("signup and invite flow", () => {
  test("fresh signup lands on queue with personal org", async ({ page }) => {
    const email = `fresh-${Date.now()}@mizan.test`;
    await page.goto("/signup");
    await page.getByLabel("Name").fill("Fresh Signup User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("CorrectHorse99!!");
    await page.getByRole("button", { name: /Create account/i }).click();
    await expect(page).toHaveURL(/\/queue/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  });

  test("invited signup joins admin org and lands on queue", async ({ page, context }) => {
    const inviteeEmail = `invitee-${Date.now()}@mizan.test`;
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/team");
    await page.getByRole("button", { name: /Invite reviewer/i }).click();
    await page.getByLabel("Email").fill(inviteeEmail);
    await page.getByRole("button", { name: /Create invite link/i }).click();
    const inviteBanner = page.locator("code").filter({ hasText: /\/invite\// });
    await expect(inviteBanner).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await inviteBanner.textContent())?.trim();
    expect(inviteUrl).toMatch(/\/invite\//);

    await context.clearCookies();
    await page.goto(inviteUrl ?? "/login");
    await page.getByRole("link", { name: /Create account/i }).click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByLabel("Email")).toHaveValue(inviteeEmail);
    await page.getByLabel("Name").fill("Invited Reviewer");
    await page.getByLabel("Password").fill("CorrectHorse99!!");
    await page.getByRole("button", { name: /Create account/i }).click();
    await expect(page).toHaveURL(/\/queue/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  });
});
