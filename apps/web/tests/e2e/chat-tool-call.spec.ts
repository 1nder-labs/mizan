/**
 * Chat tool-call E2E. LOCAL-ONLY — requires wrangler dev + vite + seeded D1.
 */
import { expect, test } from "@playwright/test";
import { REVIEWER_EMAIL, REVIEWER_PASSWORD, signIn } from "./_helpers.ts";

test.describe("chat tool call", () => {
  test("opens copilot, creates a thread, and accepts composer input", async ({ page }) => {
    await signIn(page, REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await page.keyboard.press("Meta+Shift+K");
    await expect(page.getByRole("complementary", { name: "Mizan Copilot" })).toBeVisible();
    await page.getByRole("button", { name: /New conversation/i }).click();
    const composer = page.getByPlaceholder(/Ask about cases/i);
    await expect(composer).toBeVisible();
    await composer.fill("Show my open cases");
    await expect(composer).toHaveValue("Show my open cases");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary", { name: "Mizan Copilot" })).not.toBeVisible();
  });
});
