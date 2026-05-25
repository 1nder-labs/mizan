import { describe, expect, it } from "bun:test";
import { emitWorkflowEvent } from "../../src/observability/workflow-event-logger.ts";

describe("emitWorkflowEvent", () => {
  it("is exported for the four Phase 7 lifecycle call sites", () => {
    expect(typeof emitWorkflowEvent).toBe("function");
  });
});
