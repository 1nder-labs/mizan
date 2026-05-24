import { describe, expect, it } from "bun:test";
import type { Case } from "@mizan/db";
import { classifyRedelivery } from "../../src/queue/brief-consumer-helpers.ts";

function makeCase(overrides: Partial<Case>): Case {
  return {
    id: "11111111-1111-4111-8111-111111111101",
    status: "DRAFT",
    category: "medical",
    geography: "US",
    claimed_zakat_category: "medical",
    current_run_id: null,
    brief_partial_json: null,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: "33333333-3333-4333-8333-333333333301",
    ...overrides,
  };
}

const RUN_ID = "22222222-2222-4222-8222-222222222201";

describe("classifyRedelivery", () => {
  it("returns ack-mismatch when current_run_id differs", () => {
    const row = makeCase({ current_run_id: "99999999-9999-4999-8999-999999999999" });
    expect(classifyRedelivery(row, RUN_ID, 1)).toBe("ack-mismatch");
  });

  it("returns ack-terminal for READY_FOR_REVIEW, ACTIONED, and SUSPENDED_HITL", () => {
    expect(
      classifyRedelivery(
        makeCase({ status: "READY_FOR_REVIEW", current_run_id: RUN_ID }),
        RUN_ID,
        1,
      ),
    ).toBe("ack-terminal");
    expect(
      classifyRedelivery(makeCase({ status: "ACTIONED", current_run_id: RUN_ID }), RUN_ID, 1),
    ).toBe("ack-terminal");
    expect(
      classifyRedelivery(makeCase({ status: "SUSPENDED_HITL", current_run_id: RUN_ID }), RUN_ID, 1),
    ).toBe("ack-terminal");
  });

  it("returns ack-running for RUNNING on first delivery (concurrent duplicate)", () => {
    expect(
      classifyRedelivery(makeCase({ status: "RUNNING", current_run_id: RUN_ID }), RUN_ID, 1),
    ).toBe("ack-running");
  });

  it("returns claim for RUNNING on redelivery (crash recovery)", () => {
    expect(
      classifyRedelivery(makeCase({ status: "RUNNING", current_run_id: RUN_ID }), RUN_ID, 2),
    ).toBe("claim");
    expect(
      classifyRedelivery(makeCase({ status: "RUNNING", current_run_id: RUN_ID }), RUN_ID, 7),
    ).toBe("claim");
  });

  it("returns claim for QUEUED and FAILED regardless of attempts", () => {
    expect(
      classifyRedelivery(makeCase({ status: "QUEUED", current_run_id: RUN_ID }), RUN_ID, 1),
    ).toBe("claim");
    expect(
      classifyRedelivery(makeCase({ status: "FAILED", current_run_id: RUN_ID }), RUN_ID, 3),
    ).toBe("claim");
  });

  it("returns ack-mismatch for DRAFT (orphaned queue message)", () => {
    expect(
      classifyRedelivery(makeCase({ status: "DRAFT", current_run_id: RUN_ID }), RUN_ID, 1),
    ).toBe("ack-mismatch");
  });
});
