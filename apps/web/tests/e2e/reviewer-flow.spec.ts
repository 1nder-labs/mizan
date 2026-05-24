/**
 * Reviewer happy-path smoke. Local-only: requires `wrangler dev` +
 * `vite dev` running together (Playwright `webServer` block handles
 * the spin-up). CI does not run this spec — see PRD Phase 6 plan
 * U12 verification (local-only parity with worker integration tests).
 */
import { expect, test } from "@playwright/test";

test.describe("reviewer flow", () => {
  test("login -> queue -> case detail", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in")).toBeVisible();

    await page.getByLabel("Email").fill("reviewer@mizan.dev");
    await page.getByLabel("Password").fill("changeme01");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/queue/);
    await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
    const rows = page.getByRole("row");
    await expect(rows).not.toHaveCount(0);

    await rows.nth(1).click();
    await expect(page).toHaveURL(/\/case\//);
    await expect(page.getByText(/Case/)).toBeVisible();
  });
});
