/**
 * Reviewer vs admin role boundary at /admin/audit. Reviewer redirects
 * to /queue; admin lands on the audit page.
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
  signIn,
} from "./_helpers.ts";

test.describe.configure({ mode: "serial" });

test.describe("admin guard", () => {
  test("reviewer hitting /admin/audit gets redirected to /queue", async ({ page }) => {
    await signIn(page, REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/queue/);
    await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  });

  test("admin hitting /admin/audit lands on the audit page", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/admin\/audit/);
    await expect(page.getByRole("heading", { name: /audit log/i })).toBeVisible();
  });

  test("admin sees Audit nav link in header", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page.getByRole("link", { name: /audit/i })).toBeVisible();
  });

  test("reviewer does not see Audit nav link in header", async ({ page }) => {
    await signIn(page, REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await expect(page.getByRole("link", { name: /audit/i })).not.toBeVisible();
  });
});
