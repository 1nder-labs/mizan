import { describe, expect, it } from "bun:test";
import { toWorkflowEventWire, WorkflowEventSchema } from "../src/schemas/workflow-event.ts";

describe("toWorkflowEventWire", () => {
  it("strips brief from payload_json before emitting on the wire", () => {
    const wire = toWorkflowEventWire({
      seq: 2,
      event_type: "step.suspend",
      step_id: "awaitReviewerAction",
      emitted_at: 1_700_000_000_000,
      payload_json: {
        awaiting: "reviewer_action",
        caseId: "550e8400-e29b-41d4-a716-446655440001",
        runId: "550e8400-e29b-41d4-a716-446655440002",
        briefId: "550e8400-e29b-41d4-a716-446655440003",
        brief: { recommendation: "READY_FOR_REVIEW" },
      },
    });
    expect(wire.payload_meta?.briefId).toBe("550e8400-e29b-41d4-a716-446655440003");
    expect(WorkflowEventSchema.parse(wire)).toEqual(wire);
    expect("brief" in (wire.payload_meta ?? {})).toBe(false);
  });

  it("accepts workflow.start rows without payload_meta", () => {
    const wire = toWorkflowEventWire({
      seq: 1,
      event_type: "workflow.start",
      step_id: null,
      emitted_at: new Date(1_700_000_000_000),
      payload_json: {
        caseId: "550e8400-e29b-41d4-a716-446655440001",
        runId: "550e8400-e29b-41d4-a716-446655440002",
      },
    });
    expect(wire.event_type).toBe("workflow.start");
    expect(wire.payload_meta?.caseId).toBe("550e8400-e29b-41d4-a716-446655440001");
  });
});
