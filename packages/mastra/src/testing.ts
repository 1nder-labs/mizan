/**
 * `@mizan/mastra/testing` — secondary entry point for test scaffolding.
 *
 * Tests, eval fixtures, and seed scripts import from this entry. Importing
 * this module has the side effect of registering the in-memory mock LLM
 * provider + deterministic embedding stub with `runtime/model-resolver.ts`.
 * Production code imports `@mizan/mastra` (the main entry) which never
 * pulls in the modules under `src/test/`, so the test scaffolding never
 * lands in the Worker bundle.
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
