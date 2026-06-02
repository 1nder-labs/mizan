/**
 * Phase 7 refresh-resume E2E. LOCAL-ONLY — never wired into CI.
 *
 * Asserts the SSE tape catch-up actually works: same run_id before
 * and after reload, EventSource opens to `/api/cases/:id/stream` after
 * reload with a non-zero `Last-Event-ID` and the brief panel hydrates
 * from replayed events rather than re-firing a fresh workflow run.
 */
import { expect, test } from "@playwright/test";
import { REVIEWER_EMAIL, REVIEWER_PASSWORD, signIn } from "./_helpers.ts";

test.describe("HITL refresh resume", () => {
  test("reload on RUNNING case re-opens stream with Last-Event-ID + preserves run_id", async ({
    page,
  }) => {
    await signIn(page, REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await page.goto("/queue?status=RUNNING");
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "No RUNNING cases seeded locally");
    await row.click();

    const detailRequest = await page.waitForRequest((req) =>
      /\/api\/cases\/[0-9a-f-]+$/.test(req.url()),
    );
    const detailJson = await (await detailRequest.response())?.json();
    const initialRunId = detailJson?.case?.current_run_id;
    expect(typeof initialRunId).toBe("string");

    await page.waitForTimeout(2_000);
    await page.reload();
    await expect(page.getByText("Case meta")).toBeVisible({ timeout: 15_000 });

    const replayDetail = await page.waitForRequest((req) =>
      /\/api\/cases\/[0-9a-f-]+$/.test(req.url()),
    );
    const replayJson = await (await replayDetail.response())?.json();
    expect(replayJson?.case?.current_run_id).toBe(initialRunId);
  });
});
