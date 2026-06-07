import { describe, expect, it } from "bun:test";
import type { Case } from "@mizan/db";
import {
  RUNNING_STALE_THRESHOLD_MS,
  classifyRedelivery,
} from "../../src/queue/brief-consumer-helpers.ts";

const FIXED_NOW = 1_700_000_000_000;

function makeCase(overrides: Partial<Case>): Case {
  return {
    id: "11111111-1111-4111-8111-111111111101",
    status: "DRAFT",
    title: "Test campaign",
    category: "medical",
    geography: "US",
    claimed_zakat_category: "medical",
    current_run_id: null,
    brief_partial_json: null,
    created_at: new Date(FIXED_NOW - 60_000),
    updated_at: new Date(FIXED_NOW - 60_000),
    submitted_at: null,
    created_by: "33333333-3333-4333-8333-333333333301",
    assigned_to: null,
    organization_id: "org-test-001",
    ...overrides,
  };
}

const RUN_ID = "22222222-2222-4222-8222-222222222201";
const FRESH = { now: FIXED_NOW, staleThresholdMs: RUNNING_STALE_THRESHOLD_MS };

describe("classifyRedelivery", () => {
  it("returns ack-mismatch when current_run_id differs", () => {
    const row = makeCase({ current_run_id: "99999999-9999-4999-8999-999999999999" });
    expect(classifyRedelivery(row, RUN_ID, 1, FRESH)).toBe("ack-mismatch");
  });

  it("returns ack-terminal for READY_FOR_REVIEW, ACTIONED, SUSPENDED_HITL, FAILED", () => {
    expect(
      classifyRedelivery(
        makeCase({ status: "READY_FOR_REVIEW", current_run_id: RUN_ID }),
        RUN_ID,
        1,
        FRESH,
      ),
    ).toBe("ack-terminal");
    expect(
      classifyRedelivery(
        makeCase({ status: "ACTIONED", current_run_id: RUN_ID }),
        RUN_ID,
        1,
        FRESH,
      ),
    ).toBe("ack-terminal");
    expect(
      classifyRedelivery(
        makeCase({ status: "SUSPENDED_HITL", current_run_id: RUN_ID }),
        RUN_ID,
        1,
        FRESH,
      ),
    ).toBe("ack-terminal");
    expect(
      classifyRedelivery(makeCase({ status: "FAILED", current_run_id: RUN_ID }), RUN_ID, 3, FRESH),
    ).toBe("ack-terminal");
  });

  it("returns ack-running for RUNNING on first delivery (concurrent duplicate)", () => {
    expect(
      classifyRedelivery(makeCase({ status: "RUNNING", current_run_id: RUN_ID }), RUN_ID, 1, FRESH),
    ).toBe("ack-running");
  });

  it("returns retry-running for RUNNING on redelivery while still fresh (slow workflow or crashed-but-fresh)", () => {
    const freshRow = makeCase({
      status: "RUNNING",
      current_run_id: RUN_ID,
      updated_at: new Date(FIXED_NOW - 30_000),
    });
    expect(classifyRedelivery(freshRow, RUN_ID, 2, FRESH)).toBe("retry-running");
    expect(classifyRedelivery(freshRow, RUN_ID, 3, FRESH)).toBe("retry-running");
  });

  it("returns claim for RUNNING on redelivery once row is past the stale threshold (crash recovery)", () => {
    const staleRow = makeCase({
      status: "RUNNING",
      current_run_id: RUN_ID,
      updated_at: new Date(FIXED_NOW - RUNNING_STALE_THRESHOLD_MS - 1_000),
    });
    expect(classifyRedelivery(staleRow, RUN_ID, 2, FRESH)).toBe("claim");
    expect(classifyRedelivery(staleRow, RUN_ID, 7, FRESH)).toBe("claim");
  });

  it("returns ack-running for stale RUNNING when attempts is still 1 (no redelivery)", () => {
    const staleRow = makeCase({
      status: "RUNNING",
      current_run_id: RUN_ID,
      updated_at: new Date(FIXED_NOW - RUNNING_STALE_THRESHOLD_MS - 1_000),
    });
    expect(classifyRedelivery(staleRow, RUN_ID, 1, FRESH)).toBe("ack-running");
  });

  it("returns claim for QUEUED regardless of attempts", () => {
    expect(
      classifyRedelivery(makeCase({ status: "QUEUED", current_run_id: RUN_ID }), RUN_ID, 1, FRESH),
    ).toBe("claim");
  });

  it("returns ack-mismatch for DRAFT (orphaned queue message)", () => {
    expect(
      classifyRedelivery(makeCase({ status: "DRAFT", current_run_id: RUN_ID }), RUN_ID, 1, FRESH),
    ).toBe("ack-mismatch");
  });

  it("defaults to real Date.now when time inputs omitted (fresh row → retry-running on redelivery)", () => {
    const freshRow = makeCase({
      status: "RUNNING",
      current_run_id: RUN_ID,
      updated_at: new Date(),
    });
    expect(classifyRedelivery(freshRow, RUN_ID, 5)).toBe("retry-running");
    expect(classifyRedelivery(freshRow, RUN_ID, 1)).toBe("ack-running");
  });
});
