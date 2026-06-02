import { describe, expect, it } from "bun:test";
import { buildLangfuseExporter, flushLangfuse, deriveSessionId } from "@mizan/mastra";
import { makeStubBindings } from "@mizan/shared/testing";

describe("buildLangfuseExporter fail-closed gate", () => {
  it("returns null when all credentials are absent", () => {
    const env = makeStubBindings({
      LANGFUSE_HOST: "",
      LANGFUSE_PUBLIC_KEY: "",
      LANGFUSE_SECRET_KEY: "",
    });
    expect(buildLangfuseExporter(env)).toBeNull();
  });

  it("returns null when keys present but LANGFUSE_HOST is empty", () => {
    const env = makeStubBindings({
      LANGFUSE_HOST: "",
      LANGFUSE_PUBLIC_KEY: "pk-lf-test",
      LANGFUSE_SECRET_KEY: "sk-lf-test",
    });
    expect(buildLangfuseExporter(env)).toBeNull();
  });

  it("returns null when LANGFUSE_HOST present but keys are empty", () => {
    const env = makeStubBindings({
      LANGFUSE_HOST: "http://localhost:3010",
      LANGFUSE_PUBLIC_KEY: "",
      LANGFUSE_SECRET_KEY: "",
    });
    expect(buildLangfuseExporter(env)).toBeNull();
  });

  it("returns an exporter when all three are present", () => {
    const env = makeStubBindings({
      LANGFUSE_HOST: "http://localhost:3010",
      LANGFUSE_PUBLIC_KEY: "pk-lf-test",
      LANGFUSE_SECRET_KEY: "sk-lf-test",
    });
    const exporter = buildLangfuseExporter(env);
    expect(exporter).not.toBeNull();
  });
});

describe("flushLangfuse null safety", () => {
  it("does not call waitUntil when exporter is null", () => {
    let called = false;
    const ctx = {
      waitUntil: () => {
        called = true;
      },
    };
    flushLangfuse(null, ctx as never);
    expect(called).toBe(false);
  });
});

describe("deriveSessionId determinism", () => {
  it("returns the same sessionId for the same runId", () => {
    const runId = "run-deterministic-test";
    const a = deriveSessionId(runId);
    const b = deriveSessionId(runId);
    expect(a).toBe(b);
    expect(a).toBe(runId);
  });

  it("returns different sessionIds for different runIds", () => {
    const a = deriveSessionId("run-aaa");
    const b = deriveSessionId("run-bbb");
    expect(a).not.toBe(b);
  });
});
