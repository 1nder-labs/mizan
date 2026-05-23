import { describe, expect, it } from "bun:test";
import { getEmbeddingModel, resolveBatchEmbeddings, resolveQueryEmbedding } from "@mizan/mastra";
/*
 * `@mizan/mastra/testing` registers the deterministic mock embedding
 * provider as a side-effect. Without this import the resolver falls
 * through to the real `embedPolicyText` path and this file passes only
 * when another test (e.g. `model-resolver.test.ts`) has been loaded
 * first — a load-order pollution bug Review 5 flagged. Importing the
 * registration here keeps the file isolation-safe.
 */
import "@mizan/mastra/testing";
import { makeStubBindings } from "../helpers/test-bindings.ts";

const EMBEDDING_DIM = 1536;

describe("resolveQueryEmbedding", () => {
  it("returns deterministic 1536-dim vector under MOCK_EMBEDDINGS", async () => {
    const env = makeStubBindings({ MOCK_EMBEDDINGS: "1" });
    const vector = await resolveQueryEmbedding(env, "medical zakat campaign");
    expect(vector.length).toBe(EMBEDDING_DIM);
    expect(vector.every((value) => Number.isFinite(value))).toBe(true);
  });

  it("is deterministic across calls for the same input", async () => {
    const env = makeStubBindings({ MOCK_EMBEDDINGS: "1" });
    const first = await resolveQueryEmbedding(env, "same input");
    const second = await resolveQueryEmbedding(env, "same input");
    expect(first).toEqual(second);
  });

  it("differs across distinct inputs", async () => {
    const env = makeStubBindings({ MOCK_EMBEDDINGS: "1" });
    const a = await resolveQueryEmbedding(env, "input a");
    const b = await resolveQueryEmbedding(env, "input b");
    expect(a).not.toEqual(b);
  });

  it("falls back to deterministic when MOCK_LLM_RESPONSES set without OPENAI_API_KEY", async () => {
    const env = makeStubBindings({ MOCK_LLM_RESPONSES: JSON.stringify({ default: {} }) });
    const vector = await resolveQueryEmbedding(env, "fallback");
    expect(vector.length).toBe(EMBEDDING_DIM);
  });
});

describe("resolveBatchEmbeddings", () => {
  it("returns empty array for empty input", async () => {
    const env = makeStubBindings({ MOCK_EMBEDDINGS: "1" });
    const vectors = await resolveBatchEmbeddings(env, []);
    expect(vectors).toEqual([]);
  });

  it("preserves input ordering in deterministic mode", async () => {
    const env = makeStubBindings({ MOCK_EMBEDDINGS: "1" });
    const inputs = ["alpha", "beta", "gamma"];
    const vectors = await resolveBatchEmbeddings(env, inputs);
    expect(vectors.length).toBe(3);
    expect(vectors[0]).toEqual(await resolveQueryEmbedding(env, "alpha"));
    expect(vectors[2]).toEqual(await resolveQueryEmbedding(env, "gamma"));
  });
});

describe("getEmbeddingModel", () => {
  it("throws when OPENAI_API_KEY is missing", () => {
    expect(() => getEmbeddingModel({})).toThrow("OPENAI_API_KEY");
  });

  it("returns an embedding model when key is present", () => {
    const model = getEmbeddingModel({ OPENAI_API_KEY: "test-key" });
    expect(model).toBeDefined();
  });
});
