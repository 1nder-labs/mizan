/**
 * Integration: the queue `?outcome=` filter resolves each canonical
 * CaseDisposition to exactly the cases that reach it. Seeds one case per
 * outcome (with the reviewer_action that produces it) and asserts the filter
 * returns precisely that case. Guards the inverse-of-`deriveCaseDisposition`
 * SQL in `queue-disposition.ts` against drift AND the correlated-subquery
 * null-projection footgun (a literal `cases.id` correlation regressed twice).
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { QueueResponseSchema } from "@mizan/shared";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { insertCase, seedReviewer } from "./cases-test-helpers.ts";

const BASE = "http://localhost";

async function insertAction(caseId: string, reviewerId: string, orgId: string, action: string) {
  await env.DB.prepare(
    `INSERT INTO reviewer_actions (id, case_id, run_id, reviewer_id, action, rationale, acted_at, action_id, organization_id)
     VALUES (?, ?, ?, ?, ?, 'x', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      caseId,
      crypto.randomUUID(),
      reviewerId,
      action,
      Date.now(),
      crypto.randomUUID(),
      orgId,
    )
    .run();
}

function queueUrl(outcome: string): string {
  return `${BASE}/api/cases?outcome=${outcome}&page=1&sort=updated_desc`;
}

async function idsForOutcome(outcome: string, cookie: string): Promise<string[]> {
  const res = await exports.default.fetch(
    new Request(queueUrl(outcome), { headers: { Cookie: cookie } }),
  );
  expect(res.status).toBe(200);
  const body = QueueResponseSchema.parse(await res.json());
  return body.cases.map((c) => c.id);
}

describe("queue ?outcome= filter", () => {
  let cookie = "";
  let reviewerId = "";
  let orgId = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    const reviewer = await seedReviewer();
    cookie = reviewer.cookie;
    reviewerId = reviewer.userId;
    orgId = reviewer.organizationId;

    const cases: Array<{ key: string; status: string; action: string | null }> = [
      { key: "approved", status: "ACTIONED", action: "APPROVE" },
      { key: "declined", status: "ACTIONED", action: "BLOCK" },
      { key: "escalated", status: "ACTIONED", action: "ESCALATE" },
      { key: "needs_docs", status: "ACTIONED", action: "REQUEST_DOCS" },
      { key: "awaiting", status: "SUSPENDED_HITL", action: null },
      { key: "submitted_draft", status: "DRAFT", action: null },
      { key: "submitted_queued", status: "QUEUED", action: null },
    ];
    for (const c of cases) {
      const id = crypto.randomUUID();
      ids[c.key] = id;
      await insertCase({
        id,
        status: c.status,
        category: "medical",
        geography: "US",
        createdBy: reviewerId,
        organizationId: orgId,
      });
      if (c.action) await insertAction(id, reviewerId, orgId, c.action);
    }
  }, 60_000);

  it("APPROVED returns only the approved case", async () => {
    expect(await idsForOutcome("APPROVED", cookie)).toEqual([ids.approved]);
  });

  it("DECLINED returns only the blocked case", async () => {
    expect(await idsForOutcome("DECLINED", cookie)).toEqual([ids.declined]);
  });

  it("ESCALATED returns only the escalated (not-responded) case", async () => {
    expect(await idsForOutcome("ESCALATED", cookie)).toEqual([ids.escalated]);
  });

  it("NEEDS_CLIENT_DOCS returns only the request-docs (not-responded) case", async () => {
    expect(await idsForOutcome("NEEDS_CLIENT_DOCS", cookie)).toEqual([ids.needs_docs]);
  });

  it("AWAITING_REVIEWER returns only the suspended case", async () => {
    expect(await idsForOutcome("AWAITING_REVIEWER", cookie)).toEqual([ids.awaiting]);
  });

  it("SUBMITTED returns reviewer-seeded DRAFT and QUEUED, not just QUEUED", async () => {
    expect((await idsForOutcome("SUBMITTED", cookie)).sort()).toEqual(
      [ids.submitted_draft, ids.submitted_queued].sort(),
    );
  });

  it("DRAFT is empty on the active queue — unsubmitted drafts are excluded upstream", async () => {
    expect(await idsForOutcome("DRAFT", cookie)).toEqual([]);
  });
});
