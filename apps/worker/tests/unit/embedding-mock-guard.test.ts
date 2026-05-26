import { describe, expect, it } from "bun:test";
import "@mizan/mastra/testing";
import { resolveQueryEmbedding } from "@mizan/mastra";
import { makeStubBindings } from "@mizan/shared/testing";

/**
 * Mirror of `mock-providers-allowed-guard.test.ts` for the embedding
 * resolver. The shared `MOCK_PROVIDERS_ALLOWED` flag must gate
 * `resolveQueryEmbedding` too — without it, a stray `MOCK_EMBEDDINGS`
 * env value in production would replay a deterministic vector instead
 * of calling the real OpenAI embedding endpoint.
 *
 * The mock embedding factory is deterministic (registered by
 * `@mizan/mastra/testing`), so we can compare the first element of the
 * returned vector to a hand-computed deterministic value to confirm
 * which branch fired. We don't need to know the exact number — only
 * that the same input under flag-on yields the same vector twice and
 * that flag-off + no OPENAI_API_KEY throws (the real embedding path).
 */
describe("embedding mock fail-closed guard", () => {
  it("returns a deterministic vector when MOCK_PROVIDERS_ALLOWED + MOCK_EMBEDDINGS are set", async () => {
    const env = makeStubBindings({ MOCK_PROVIDERS_ALLOWED: "1", MOCK_EMBEDDINGS: "1" });
    const first = await resolveQueryEmbedding(env, "test text");
    const second = await resolveQueryEmbedding(env, "test text");
    expect(first.length).toBe(1536);
    expect(first).toEqual(second);
  });

  it("falls through to the real embedding path when MOCK_PROVIDERS_ALLOWED is unset", async () => {
    const env = makeStubBindings({ MOCK_EMBEDDINGS: "1" });
    delete env.MOCK_PROVIDERS_ALLOWED;
    /*
     * No OPENAI_API_KEY and no mock branch → the real `embedPolicyText`
     * path throws "OPENAI_API_KEY is required for embedding operations".
     * That throw IS the assertion: it proves the resolver did not
     * silently fall back to the mock vector.
     */
    await expect(resolveQueryEmbedding(env, "test text")).rejects.toThrow(
      /OPENAI_API_KEY is required/,
    );
  });

  it("falls through to the real path when MOCK_PROVIDERS_ALLOWED is any string other than '1'", async () => {
    const env = makeStubBindings({
      MOCK_PROVIDERS_ALLOWED: "true",
      MOCK_EMBEDDINGS: "1",
    });
    await expect(resolveQueryEmbedding(env, "test text")).rejects.toThrow(
      /OPENAI_API_KEY is required/,
    );
  });
});
