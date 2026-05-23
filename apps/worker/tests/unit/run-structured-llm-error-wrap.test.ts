import { describe, expect, it } from "bun:test";
import "@mizan/mastra/testing";
import { runStructuredLlm, serializeMockResponses } from "@mizan/mastra/testing";
import type { MizanRuntimeContext } from "@mizan/mastra";
import { z } from "zod";
import { makeStubBindings } from "../helpers/test-bindings.ts";

const SmokeSchema = z.object({ message: z.string() });

function envWithMocks(map: Record<string, unknown>): ReturnType<typeof makeStubBindings> {
  return makeStubBindings({ MOCK_LLM_RESPONSES: serializeMockResponses(map) });
}

const CTX: MizanRuntimeContext = {
  caseId: "case-error-wrap",
  runId: "run-error-wrap",
  reviewerId: null,
  sessionId: null,
  category: "test",
  geography: "US",
  langfuseEnabled: false,
};

/**
 * `runStructuredLlm` wraps any SDK / provider / Zod error with the step
 * + schema + provider + model triage tuple. These tests pin both the
 * wrapping behaviour (so on-call grep finds the failing call site) and
 * the AbortError passthrough (so cancel semantics survive the wrap).
 */
describe("runStructuredLlm error wrapping", () => {
  it("returns parsed output when the mock provider has a matching response", async () => {
    const result = await runStructuredLlm({
      env: envWithMocks({ "smoke.ok": { message: "hi" } }),
      ctx: CTX,
      stepName: "smoke",
      schemaName: "smoke.ok",
      modelKind: "extract",
      schema: SmokeSchema,
      system: "noop",
      userPayload: "noop",
      abortSignal: undefined,
    });
    expect(result.message).toBe("hi");
  });

  it("wraps a missing-mock response error with the step + schema tuple", async () => {
    await expect(
      runStructuredLlm({
        env: envWithMocks({ "other-schema.ok": { message: "hi" } }),
        ctx: CTX,
        stepName: "extractFoo",
        schemaName: "smoke.ok",
        modelKind: "extract",
        schema: SmokeSchema,
        system: "noop",
        userPayload: "noop",
        abortSignal: undefined,
      }),
    ).rejects.toThrow(/runStructuredLlm failed.*step=extractFoo.*schema=smoke\.ok/);
  });

  it("preserves the original mock-provider error message in the wrapped triage line", async () => {
    await expect(
      runStructuredLlm({
        env: envWithMocks({ "other-schema.ok": { message: "hi" } }),
        ctx: CTX,
        stepName: "extractFoo",
        schemaName: "missing.schema",
        modelKind: "extract",
        schema: SmokeSchema,
        system: "noop",
        userPayload: "noop",
        abortSignal: undefined,
      }),
    ).rejects.toThrow(/missing\.schema/);
  });

  /**
   * Pre-aborted signal: the mock provider is purely synchronous and
   * does not consult the signal, so the request still completes. The
   * AbortError passthrough lives behind the SDK's own abort plumbing,
   * which the mock bypasses — covered by integration tests, where the
   * SSE-disconnect path exercises the real `generateText` abort hook.
   * This unit-level case just confirms the resolved-path is not
   * wrapped when the underlying call returns success.
   */
  it("does not wrap when generateText returns successfully even with a pre-aborted signal (mock path)", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runStructuredLlm({
      env: envWithMocks({ "smoke.ok": { message: "hi" } }),
      ctx: CTX,
      stepName: "smoke",
      schemaName: "smoke.ok",
      modelKind: "extract",
      schema: SmokeSchema,
      system: "noop",
      userPayload: "noop",
      abortSignal: controller.signal,
    });
    expect(result.message).toBe("hi");
  });
});
