/**
 * Integration: GET /api/cases/:id/stream — Last-Event-ID catch-up over a
 * seeded `workflow_events` tape. Live-tail polling is exercised by
 * `hitl-cycle.test.ts`; this file pins the replay semantics.
 *
 * Vitest + Miniflare. Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, inject, it } from "vitest";

const BASE = "http://localhost";

async function seedReviewer(): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = `sse-reviewer-${Date.now()}-${Math.random()}@test.local`;
  const password = "CorrectHorse99!!";
  await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "SSE Reviewer" }),
    }),
  );
  const signIn = await exports.default.fetch(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row?.id) throw new Error("reviewer seed failed");
  const memberRow = await env.DB.prepare(
    "SELECT organization_id FROM members WHERE user_id = ? LIMIT 1",
  )
    .bind(row.id)
    .first<{ organization_id: string }>();
  if (!memberRow?.organization_id) throw new Error("sse reviewer org seed failed");
  return {
    cookie: signIn.headers.getSetCookie().join("; "),
    userId: row.id,
    organizationId: memberRow.organization_id,
  };
}

async function insertCase(
  caseId: string,
  runId: string,
  createdBy: string,
  organizationId: string,
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, current_run_id, created_by, organization_id, created_at, updated_at)
     VALUES (?, 'ACTIONED', 'humanitarian', 'PS', NULL, NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(caseId, runId, createdBy, organizationId, now, now)
    .run();
}

async function seedTape(caseId: string, runId: string, organizationId: string): Promise<void> {
  const types = ["workflow.start", "step.suspend", "step.resume", "workflow.finish"] as const;
  for (let i = 0; i < types.length; i += 1) {
    await env.DB.prepare(
      `INSERT INTO workflow_events (id, case_id, run_id, seq, event_type, step_id, payload_json, organization_id, emitted_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    )
      .bind(crypto.randomUUID(), caseId, runId, i + 1, types[i], organizationId, Date.now())
      .run();
  }
}

async function readSseFrames(
  res: Response,
): Promise<Array<{ id?: string; event?: string; data?: string }>> {
  const text = await res.text();
  const frames: Array<{ id?: string; event?: string; data?: string }> = [];
  for (const chunk of text.split("\n\n")) {
    if (!chunk.trim()) continue;
    const frame: { id?: string; event?: string; data?: string } = {};
    for (const line of chunk.split("\n")) {
      if (line.startsWith("id:")) frame.id = line.slice(3).trim();
      else if (line.startsWith("event:")) frame.event = line.slice(6).trim();
      else if (line.startsWith("data:")) frame.data = line.slice(5).trim();
    }
    frames.push(frame);
  }
  return frames;
}

describe("GET /api/cases/:id/stream", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
  }, 60_000);

  it("returns 401 without a session", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${crypto.randomUUID()}/stream`),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when :id is not a UUID", async () => {
    const { cookie } = await seedReviewer();
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/not-a-uuid/stream`, { headers: { Cookie: cookie } }),
    );
    expect(res.status).toBe(400);
  });

  it("replays all events when Last-Event-ID absent and closes on workflow.finish", async () => {
    const { cookie, userId, organizationId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertCase(caseId, runId, userId, organizationId);
    await seedTape(caseId, runId, organizationId);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/stream`, { headers: { Cookie: cookie } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const frames = await readSseFrames(res);
    const events = frames.filter((f) => f.event).map((f) => f.event);
    expect(events).toEqual(["workflow.start", "step.suspend", "step.resume", "workflow.finish"]);
  });

  it("replays only events after Last-Event-ID", async () => {
    const { cookie, userId, organizationId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertCase(caseId, runId, userId, organizationId);
    await seedTape(caseId, runId, organizationId);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/stream`, {
        headers: { Cookie: cookie, "Last-Event-ID": "2" },
      }),
    );
    const frames = await readSseFrames(res);
    const events = frames.filter((f) => f.event).map((f) => f.event);
    expect(events).toEqual(["step.resume", "workflow.finish"]);
  });

  it("emits zero events when Last-Event-ID equals max seq (boundary)", async () => {
    const { cookie, userId, organizationId } = await seedReviewer();
    const caseId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await insertCase(caseId, runId, userId, organizationId);
    await seedTape(caseId, runId, organizationId);

    const res = await exports.default.fetch(
      new Request(`${BASE}/api/cases/${caseId}/stream`, {
        headers: { Cookie: cookie, "Last-Event-ID": "4" },
      }),
    );
    const frames = await readSseFrames(res);
    const events = frames.filter((f) => f.event);
    expect(events).toHaveLength(0);
  });
});
