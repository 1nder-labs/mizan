/**
 * Integration: emitLiveEvent batch atomicity and executeEmit monotonic seq.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, inject } from "vitest";
import { cases, emitLiveEvent, executeEmit, makeDb } from "@mizan/db";

const TOPIC = "org:emit-atomicity-test";

function statusChangedPayload(caseId: string) {
  return {
    event_type: "case.status_changed" as const,
    case_id: caseId,
    from_status: "DRAFT" as const,
    to_status: "QUEUED" as const,
  };
}

describe("emit live event atomicity", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("rolls back emit when batched primary write fails", async () => {
    const db = makeDb(env.DB);
    const caseId = crypto.randomUUID();
    const emit = emitLiveEvent(db, {
      topic: TOPIC,
      eventType: "case.status_changed",
      payload: statusChangedPayload(caseId),
      organizationId: null,
      actorUserId: null,
    });
    await expect(
      db.batch([
        db.insert(cases).values({
          id: caseId,
          category: "humanitarian",
          geography: "US",
          organization_id: "missing-organization-id",
          created_by: "missing-user-id",
        }),
        emit,
      ]),
    ).rejects.toThrow();

    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM live_events WHERE topic = ?")
      .bind(TOPIC)
      .first<{ count: number }>();
    expect(row?.count ?? 0).toBe(0);
  });

  it("executeEmit produces strictly increasing seq for concurrent inserts", async () => {
    const db = makeDb(env.DB);
    const caseId = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        executeEmit(db, {
          topic: `${TOPIC}:mono-${index % 2}`,
          eventType: "case.status_changed",
          payload: statusChangedPayload(`${caseId}-${index}`),
          organizationId: null,
          actorUserId: null,
        }),
      ),
    );
    const seqs = results.map((row) => row.seq);
    for (const seq of seqs) {
      expect(seq).toBeGreaterThan(0);
    }
    const topicA = `${TOPIC}:mono-0`;
    const topicRows = await env.DB.prepare(
      "SELECT seq FROM live_events WHERE topic = ? ORDER BY seq",
    )
      .bind(topicA)
      .all<{ seq: number }>();
    const topicSeqs = (topicRows.results ?? []).map((row) => row.seq);
    for (let index = 1; index < topicSeqs.length; index += 1) {
      const prev = topicSeqs[index - 1];
      const current = topicSeqs[index];
      if (prev === undefined || current === undefined) continue;
      expect(current).toBeGreaterThan(prev);
    }
  });
});
