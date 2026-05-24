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

  test("derives step states from data-workflow events", () => {
    const view = foldParts([
      { type: "data-workflow", data: { event: "step.start", step: "extractClaims" } },
      {
        type: "data-workflow",
        data: { event: "step.finish", step: "extractClaims", durationMs: 1234 },
      },
    ]);
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0]).toMatchObject({
      id: "extractClaims",
      state: "done",
      durationMs: 1234,
    });
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
