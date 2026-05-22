import { describe, expect, it } from "bun:test";
import { makeTelemetry } from "@mizan/mastra";

describe("makeTelemetry", () => {
  it("returns Langfuse-compatible envelope with custom Mizan fields", () => {
    const envelope = makeTelemetry({
      stepName: "extractCreatorIdDoc",
      callPurpose: "extract",
      runtimeContext: {
        caseId: crypto.randomUUID(),
        runId: crypto.randomUUID(),
        reviewerId: crypto.randomUUID(),
        sessionId: null,
        category: "medical",
        geography: "US",
        langfuseEnabled: true,
      },
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });

    expect(envelope.isEnabled).toBe(true);
    expect(envelope.functionId).toBe("extractCreatorIdDoc.extract");
    expect(envelope.metadata.tags).toBe("mizan,medical,US");
    expect(envelope.metadata.sessionId).toBe("");
    expect(envelope.metadata.userId).toBeTruthy();
    expect(envelope.metadata.caseId).toBeTruthy();
    expect(envelope.metadata.runId).toBeTruthy();
    expect(envelope.metadata.stepId).toBe("extractCreatorIdDoc");
    expect(envelope.metadata.provider).toBe("anthropic");
    expect(envelope.metadata.model).toBe("claude-haiku-4-5");
  });
});
