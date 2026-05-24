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

import { __resetTestProvidersForTesting, registerTestProviders } from "./runtime/model-resolver.ts";
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

/**
 * Re-registers the default mock LLM + embedding providers. Used by
 * tests that explicitly reset the provider registry (e.g.
 * `register-test-providers.test.ts`) to leave it in the
 * default-mocks-installed state subsequent tests expect.
 */
export function installDefaultMockProviders(): void {
  registerTestProviders({
    mockLanguageModel: mockProvider,
    mockEmbedding: deterministicEmbedding,
  });
}

installDefaultMockProviders();

export { __resetTestProvidersForTesting, registerTestProviders };

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

/**
 * Step-internal helpers: decision projections, parallel-merge reducers,
 * deterministic stubs, seed-case schemas, persisted-write wrappers, and
 * pure helpers tests deep-import. These are only consumed by tests +
 * eval fixtures and would otherwise sprawl the main barrel — keeping
 * them on `./testing` means the main `@mizan/mastra` entry stays a
 * production surface (predicates + factories + types persisted to
 * `cases.brief_partial_json` or returned by route handlers).
 */
export { assertGateInputs, escalateBriefProjection } from "./steps/forcedEscalateGate/index.ts";
export { forcedEscalateReason } from "./steps/forcedEscalateGate/predicate.ts";
export { mergeParallelSignals, mergeSignals } from "./steps/mergeSignals.ts";
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
export { isCloudflareBindings } from "./runtime/context-accessors.ts";
export { upsertSignal, type SignalUpsertInput } from "./steps/shared/upsertSignal.ts";
export { updatePersistedBrief } from "./steps/shared/updateBrief.ts";
export {
  runStructuredLlm,
  runStructuredLlmWithMessages,
  type StructuredLlmInvocation,
  type StructuredLlmInvocationWithMessages,
  type StructuredLlmMessage,
} from "./steps/shared/runStructuredLlm.ts";
export {
  persistBrief,
  runComposeBriefGeneration,
  buildPerCallBriefSchema,
  type ComposeBriefLlmOutput,
  type ComposeContext,
} from "./steps/composeBrief/run.ts";
export {
  applyCitationFilter,
  buildClauseIdSchema,
  buildPromptWithClauses,
  type ComposeBriefBasePayload,
  type ComposeBriefPromptBody,
} from "./steps/composeBrief/helpers.ts";
export {
  buildPolicyQuery,
  parseMatchToCitation,
  resolveExcerptMap,
  resolvePolicySource,
} from "./steps/matchPolicy/helpers.ts";
export { composePhotoSignalPayload } from "./steps/photoSignal/helpers.ts";
export { aiGenStub } from "./tools/ai-gen-stub.ts";
export { reverseImageStub } from "./tools/reverse-image-stub.ts";
export { SeedCaseSchema, type SeedCase } from "@mizan/shared";
export type { PartialBriefState } from "./schemas/partial-brief-state.ts";
