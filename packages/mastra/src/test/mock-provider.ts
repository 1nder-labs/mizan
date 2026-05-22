import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { z } from "zod";
import { JsonValueSchema, type JsonValue } from "../schemas/json-value.ts";

/** MOCK_LLM_RESPONSES map keyed by generateObject schemaName. */
export const MockResponseMapSchema = z.record(z.string(), JsonValueSchema);

export type MockResponseMap = z.infer<typeof MockResponseMapSchema>;

const MOCK_USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function parseResponseMap(serializedMap?: string): MockResponseMap {
  if (!serializedMap) return {};
  return MockResponseMapSchema.parse(JSON.parse(serializedMap));
}

function lookupResponse(map: MockResponseMap, schemaName: string | undefined): JsonValue {
  if (schemaName && schemaName in map) {
    const hit = map[schemaName];
    if (hit !== undefined) return hit;
  }
  const fallback = map["default"];
  if (fallback !== undefined) return fallback;
  throw new MissingMockResponseError(schemaName);
}

/**
 * Thrown by the test-only `mockProvider` when no canned response is registered
 * for a given `schemaName`. Consumers use `instanceof` identity matching to
 * distinguish this from real LLM provider errors.
 */
export class MissingMockResponseError extends Error {
  readonly schemaName: string | undefined;
  constructor(schemaName: string | undefined) {
    super(`mock provider: no canned response for schema ${schemaName ?? "missing"}`);
    this.name = "MissingMockResponseError";
    this.schemaName = schemaName;
  }
}

function schemaNameFromOptions(options: LanguageModelV3CallOptions): string | undefined {
  if (options.responseFormat?.type === "json") {
    return options.responseFormat.name;
  }
  return undefined;
}

function buildGenerateResult(object: JsonValue): LanguageModelV3GenerateResult {
  const text = JSON.stringify(object);
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: MOCK_USAGE,
    warnings: [],
  };
}

function buildStream(text: string): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "mock-1" });
      controller.enqueue({ type: "text-delta", id: "mock-1", delta: text });
      controller.enqueue({ type: "text-end", id: "mock-1" });
      controller.enqueue({
        type: "finish",
        finishReason: { unified: "stop", raw: "stop" },
        usage: MOCK_USAGE,
      });
      controller.close();
    },
  });
}

/**
 * Returns a LanguageModelV3 that replays canned object responses keyed by
 * generateObject schemaName (passed through responseFormat.name).
 */
export function mockProvider(serializedMap?: string): LanguageModelV3 {
  const responses = parseResponseMap(serializedMap);
  return {
    specificationVersion: "v3",
    provider: "mock",
    modelId: "mock-llm",
    supportedUrls: {},
    doGenerate: async (options) => {
      const schemaName = schemaNameFromOptions(options);
      return buildGenerateResult(lookupResponse(responses, schemaName));
    },
    doStream: async (options) => {
      const schemaName = schemaNameFromOptions(options);
      const object = lookupResponse(responses, schemaName);
      const text = JSON.stringify(object);
      return { stream: buildStream(text) };
    },
  };
}

/** Parses MOCK_LLM_RESPONSES for tests that assert schema compatibility. */
export function parseMockResponseMap(serializedMap: string): MockResponseMap {
  return parseResponseMap(serializedMap);
}

/** Validates a canned-response entry before writing test fixtures. */
export function validateMockEntry(entry: unknown): JsonValue {
  return JsonValueSchema.parse(entry);
}
