/**
 * Unit tests for briefProducerGuard middleware decisions.
 *
 * D1-backed claim behavior at the route level is covered in
 * integration/producer-guard.test.ts. These unit tests pin the guard's
 * decision logic via a mocked DB: DRAFT/FAILED claim QUEUED (replay=false);
 * QUEUED/RUNNING in-flight rejoin (replay=true); terminal statuses 409.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Case } from "@mizan/db";
import type { CloudflareBindings } from "../../src/env.ts";
import type { ProducerVariables } from "../../src/middleware/producer-guard.ts";

const draftRow: Case = {
  id: "11111111-1111-4111-8111-111111111101",
  status: "DRAFT",
  title: "Test campaign",
  category: "medical",
  geography: "US",
  claimed_zakat_category: "medical",
  current_run_id: null,
  brief_partial_json: null,
  created_at: new Date(),
  updated_at: new Date(),
  submitted_at: null,
  archived_at: null,
  created_by: "33333333-3333-4333-8333-333333333301",
  assigned_to: null,
  organization_id: "org-test-001",
};

const queuedRow: Case = {
  ...draftRow,
  status: "QUEUED",
  current_run_id: "22222222-2222-4222-8222-222222222201",
};

const runningRow: Case = {
  ...draftRow,
  status: "RUNNING",
  current_run_id: "33333333-3333-4333-8333-333333333301",
};

let selectRows: Case[] = [draftRow];
let lastSetStatus: string | undefined;
let lastRunId: string | null = null;

const dbChain = {
  from: () => dbChain,
  where: () => dbChain,
  limit: () => Promise.resolve(selectRows),
  get: () =>
    Promise.resolve({
      ...draftRow,
      status: lastSetStatus ?? draftRow.status,
      current_run_id: lastRunId,
    }),
  set: (values: { status: string; current_run_id?: string | null }) => {
    lastSetStatus = values.status;
    if (values.current_run_id !== undefined) {
      lastRunId = values.current_run_id;
    }
    return dbChain;
  },
  returning: () =>
    Promise.resolve([
      {
        ...draftRow,
        status: lastSetStatus ?? draftRow.status,
        current_run_id: lastRunId,
      },
    ]),
};

mock.module("@mizan/db", () => ({
  makeDb: () => ({
    select: () => dbChain,
    update: () => dbChain,
    batch: async () => undefined,
  }),
  buildStatusChangedEmits: () => [],
  emitLiveEvent: () => ({}),
  emitLiveEventsBestEffort: async () => undefined,
  cases: {
    id: "id",
    status: "status",
    current_run_id: "current_run_id",
    updated_at: "updated_at",
    organization_id: "organization_id",
  },
  eq: () => ({}),
  and: () => ({}),
  inArray: () => ({}),
}));

const { briefProducerGuard } = await import("../../src/middleware/producer-guard.ts");

function makeApp() {
  return new Hono<{ Bindings: CloudflareBindings; Variables: ProducerVariables }>()
    .use("*", async (c, next) => {
      c.set("viewer", {
        userId: "33333333-3333-4333-8333-333333333301",
        role: "reviewer",
        organizationId: "org-test-001",
      });
      await next();
    })
    .post("/:id/brief", briefProducerGuard, (c) =>
      c.json({
        runId: c.get("runId"),
        replay: c.get("replay"),
        status: c.get("caseRow").status,
      }),
    );
}

describe("briefProducerGuard unit", () => {
  beforeEach(() => {
    selectRows = [draftRow];
    lastSetStatus = undefined;
    lastRunId = null;
  });

  it("DRAFT row → claims QUEUED, replay=false", async () => {
    selectRows = [draftRow];
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/11111111-1111-4111-8111-111111111101/brief", {
        method: "POST",
      }),
      { DB: {} } as CloudflareBindings,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { replay: boolean; status: string };
    expect(body.replay).toBe(false);
    expect(lastSetStatus).toBe("QUEUED");
  });

  it("QUEUED in-flight row → relay=true, returns existing runId", async () => {
    selectRows = [queuedRow];
    const expectedRunId = queuedRow.current_run_id ?? "";
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/11111111-1111-4111-8111-111111111101/brief", {
        method: "POST",
      }),
      { DB: {} } as CloudflareBindings,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: string; replay: boolean };
    expect(body.replay).toBe(true);
    expect(body.runId).toBe(expectedRunId);
  });

  it("RUNNING in-flight row → replay=true, returns existing runId", async () => {
    selectRows = [runningRow];
    const expectedRunId = runningRow.current_run_id ?? "";
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/11111111-1111-4111-8111-111111111101/brief", {
        method: "POST",
      }),
      { DB: {} } as CloudflareBindings,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: string; replay: boolean };
    expect(body.replay).toBe(true);
    expect(body.runId).toBe(expectedRunId);
  });

  it("SUSPENDED_HITL row → 409 invalid_source_status", async () => {
    selectRows = [{ ...draftRow, status: "SUSPENDED_HITL", current_run_id: null }];
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/11111111-1111-4111-8111-111111111101/brief", {
        method: "POST",
      }),
      { DB: {} } as CloudflareBindings,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_source_status");
  });

  it("case not found → 404", async () => {
    selectRows = [];
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/11111111-1111-4111-8111-111111111101/brief", {
        method: "POST",
      }),
      { DB: {} } as CloudflareBindings,
    );
    expect(res.status).toBe(404);
  });
});
