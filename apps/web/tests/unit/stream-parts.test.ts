import { describe, expect, test } from "bun:test";
import { foldParts } from "../../src/components/brief/stream-parts.ts";

describe("foldParts", () => {
  test("accumulates streaming text", () => {
    const view = foldParts([
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ]);
    expect(view.text).toBe("Hello world");
  });

  test("groups tool parts by toolCallId", () => {
    const view = foldParts([
      { type: "tool-extractClaims", toolCallId: "tc-1", state: "input-available", input: { x: 1 } },
      {
        type: "tool-extractClaims",
        toolCallId: "tc-1",
        state: "output-available",
        output: { ok: true },
      },
    ]);
    expect(view.tools).toHaveLength(1);
    expect(view.tools[0]?.state).toBe("output-available");
    expect(view.tools[0]?.input).toEqual({ x: 1 });
    expect(view.tools[0]?.output).toEqual({ ok: true });
  });

  test("derives step state from a data-workflow-step status update", () => {
    const view = foldParts([
      {
        type: "data-workflow-step",
        data: { stepId: "classifyCampaign", step: { status: "running" } },
      },
      {
        type: "data-workflow-step",
        data: { stepId: "classifyCampaign", step: { status: "success" } },
      },
    ]);
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0]).toMatchObject({
      id: "classifyCampaign",
      label: "Classifying campaign",
      state: "done",
    });
  });

  test("surfaces a step result detail from the step output", () => {
    const view = foldParts([
      {
        type: "data-workflow-step",
        data: {
          stepId: "classifyCampaign",
          step: {
            status: "success",
            output: {
              classify: {
                category: "medical",
                verification_path: "documentary",
                geography_tier: "SAFE",
              },
            },
          },
        },
      },
    ]);
    expect(view.steps[0]?.detail).toBe("medical · documentary · SAFE");
  });

  test("derives steps from a data-workflow snapshot map and keeps terminal states", () => {
    const view = foldParts([
      {
        type: "data-workflow",
        data: {
          steps: {
            classifyCampaign: { status: "success" },
            matchPolicy: { status: "running" },
          },
        },
      },
      {
        type: "data-workflow",
        data: {
          steps: { classifyCampaign: { status: "running" }, matchPolicy: { status: "running" } },
        },
      },
    ]);
    const byId = Object.fromEntries(view.steps.map((s) => [s.id, s.state]));
    expect(byId.classifyCampaign).toBe("done");
    expect(byId.matchPolicy).toBe("running");
  });

  test("captures error parts as errorText", () => {
    const view = foldParts([{ type: "error", errorText: "Workflow boom" }]);
    expect(view.errorText).toBe("Workflow boom");
  });

  test("ignores malformed parts", () => {
    const view = foldParts([null, { not: "a part" }, { type: 123 }]);
    expect(view.text).toBe("");
    expect(view.tools).toHaveLength(0);
    expect(view.steps).toHaveLength(0);
    expect(view.errorText).toBeNull();
  });
});
