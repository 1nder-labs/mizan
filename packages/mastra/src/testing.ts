/**
 * `@mizan/mastra/testing` — secondary entry point for test scaffolding +
 * internal step plumbing only consumed by tests, eval fixtures, and seed
 * scripts.
 *
 * Two responsibilities:
 *
 * 1. Side-effect: register the in-memory mock LLM provider + deterministic
 *    embedding stub with `runtime/model-resolver.ts`. Production code
 *    imports `@mizan/mastra` (the main entry) which never pulls in modules
 *    under `src/test/`, so the test scaffolding never lands in the Worker
 *    bundle.
 *
 * 2. Re-export step-internals that are otherwise unit-test private —
 *    decision-projection helpers, parallel-merge reducers, deterministic
 *    stubs, seed-case schemas. The main barrel stays focused on what a
 *    production consumer (route handler, eval target, future agent
 *    surface) needs; the test layer goes through this subpath.
 */

import { registerTestProviders } from "./runtime/model-resolver.ts";
import { mockProvider } from "./test/mock-provider.ts";

const MOCK_EMBEDDING_DIMENSION = 1536;

function deterministicEmbedding(text: string): number[] {
  const vector = Array.from<number>({ length: MOCK_EMBEDDING_DIMENSION }).fill(0);
  let seed = 0;
  for (let i = 0; i < text.length; i += 1) {
    seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < MOCK_EMBEDDING_DIMENSION; i += 1) {
    seed = (seed * 1664525 + 1013904223 + i) >>> 0;
    vector[i] = (seed % 1000) / 1000 - 0.5;
  }
  return vector;
}

registerTestProviders({
  mockLanguageModel: mockProvider,
  mockEmbedding: deterministicEmbedding,
});

export {
  mockProvider,
  MissingMockResponseError,
  parseMockResponseMap,
  validateMockEntry,
} from "./test/mock-provider.ts";
export {
  case001Responses,
  case002Responses,
  case003Responses,
  case004Responses,
  case005Responses,
  case006Responses,
  case007Responses,
  case008Responses,
  responsesForCaseIndex,
  SEED_CASE_IDS,
  serializeMockResponses,
} from "./test/canned-responses/index.ts";

/*
 * Step-internal helpers: decision projections, parallel-merge reducers,
 * deterministic stubs, seed-case schemas. These are only consumed by
 * tests + eval fixtures and would otherwise sprawl the main barrel.
 */
export { assertGateInputs, escalateBriefProjection } from "./steps/forcedEscalateGate/index.ts";
export { mergeParallelSignals } from "./steps/mergeSignals.ts";
export { assertComputeVerificationPathInputs } from "./steps/computeVerificationPath.ts";
export {
  assertFinalizeCaseStatusInputs,
  buildCaseNotFoundError,
} from "./steps/finalizeCaseStatus.ts";
export { normalizeStorySignal } from "./steps/storyCoherence/index.ts";
export {
  buildDraftPrompt,
  decideDraftAction,
  type DraftDecision,
} from "./steps/draftOrganizerMessage/prompt.ts";
export { aiGenStub } from "./tools/ai-gen-stub.ts";
export { reverseImageStub } from "./tools/reverse-image-stub.ts";
export { SeedCaseSchema, type SeedCase } from "./seeds/seed-case-schema.ts";
