/**
 * Unit tests for producerGuard target status factory.
 *
 * D1-backed claim behavior is covered in integration/producer-guard.test.ts.
 * These tests pin the factory contract: each target produces middleware and
 * the replay-202 option surfaces in-flight rows as HTTP 202 instead of 409.
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
  cases: {
    id: "id",
    status: "status",
    current_run_id: "current_run_id",
    updated_at: "updated_at",
  },
  eq: () => ({}),
  and: () => ({}),
  inArray: () => ({}),
}));

const { producerGuard } = await import("../../src/middleware/producer-guard.ts");

function makeApp(target: "RUNNING" | "QUEUED") {
  return new Hono<{ Bindings: CloudflareBindings; Variables: ProducerVariables }>()
    .use("*", async (c, next) => {
      c.set("viewer", {
        userId: "33333333-3333-4333-8333-333333333301",
        role: "reviewer",
        organizationId: "org-test-001",
      });
      await next();
    })
    .post("/:id/brief", producerGuard(target), (c) =>
      c.json({ runId: c.get("runId"), status: c.get("caseRow").status }),
    );
}

describe("producerGuard target factory", () => {
  beforeEach(() => {
    selectRows = [draftRow];
    lastSetStatus = undefined;
    lastRunId = null;
  });

  it('factory with target "RUNNING" sets cases.status to RUNNING', async () => {
    const app = makeApp("RUNNING");
    const res = await app.fetch(
      new Request("http://localhost/11111111-1111-4111-8111-111111111101/brief", {
        method: "POST",
      }),
      { DB: {} } as CloudflareBindings,
    );
    expect(res.status).toBe(200);
    expect(lastSetStatus).toBe("RUNNING");
  });

  it('factory with target "QUEUED" sets cases.status to QUEUED', async () => {
    const app = makeApp("QUEUED");
    const res = await app.fetch(
      new Request("http://localhost/11111111-1111-4111-8111-111111111101/brief", {
        method: "POST",
      }),
      { DB: {} } as CloudflareBindings,
    );
    expect(res.status).toBe(200);
    expect(lastSetStatus).toBe("QUEUED");
  });

  it("replay-202 returns 202 for in-flight QUEUED rows", async () => {
    selectRows = [queuedRow];
    const app = makeApp("QUEUED");
    const res = await app.fetch(
      new Request("http://localhost/11111111-1111-4111-8111-111111111101/brief", {
        method: "POST",
      }),
      { DB: {} } as CloudflareBindings,
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({
      status: "QUEUED",
      run_id: queuedRow.current_run_id,
      replay: true,
    });
  });
});
