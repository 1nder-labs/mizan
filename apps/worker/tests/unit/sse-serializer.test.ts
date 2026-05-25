import { describe, expect, it } from "bun:test";
import { formatSseEvent } from "../../src/sse/serializer.ts";

describe("formatSseEvent", () => {
  it("formats W3C SSE frames with id, event, and data lines", () => {
    const frame = formatSseEvent({
      id: 47,
      event: "step.suspend",
      data: { seq: 47, event_type: "step.suspend" },
    });
    expect(frame).toBe(
      'id: 47\nevent: step.suspend\ndata: {"seq":47,"event_type":"step.suspend"}\n\n',
    );
  });
});
