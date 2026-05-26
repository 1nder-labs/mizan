import { generateText, Output } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { z } from "zod";
import { resolveLanguageModel } from "../../runtime/model-resolver.ts";
import { makeTelemetry } from "../../runtime/telemetry.ts";
import type { CloudflareBindings } from "@mizan/shared";
import type { ModelConfig, ModelKind } from "../../models/factory.ts";
import type { MizanRuntimeContext } from "../../observability/runtime-context.ts";
import { toImagePart } from "../../util/image-format.ts";

const MAX_RETRIES = 2;

/**
 * AI SDK 6 canonical structured-output API.
 *
 * `generateObject` is deprecated in 6.x in favour of
 * `generateText({ output: Output.object({ schema, name }) })` (per
 * vercel/ai docs and the v6 migration notes). The new API is
 * behaviourally equivalent — `result.output` carries the parsed object,
 * `NoObjectGeneratedError` still throws on JSON-parse or
 * schema-validation failure, and Zod 4 discriminated unions + `.strict()`
 * objects go through the same internal path. `schemaName` becomes the
 * `name` parameter on `Output.object`, which feeds the provider's
 * `responseFormat.name` field; telemetry remains a top-level
 * `experimental_telemetry` argument on `generateText`.
 */

/** Multimodal-friendly message shape passed to `generateObject`. */
export interface StructuredLlmMessage {
  readonly role: "user";
  readonly content: ReadonlyArray<
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "image"; readonly image: Uint8Array; readonly mediaType?: string }
  >;
}

interface BaseInvocation<TOutput> {
  readonly env: CloudflareBindings;
  readonly ctx: MizanRuntimeContext;
  readonly stepName: string;
  readonly schemaName: string;
  readonly modelKind: ModelKind;
  readonly schema: z.ZodType<TOutput>;
  readonly system: string;
  readonly abortSignal: AbortSignal | undefined;
  readonly postProcess?: (parsed: TOutput) => TOutput;
}

/** Text-only invocation: caller passes a single user-turn string. */
export type StructuredLlmInvocation<TOutput> = BaseInvocation<TOutput> & {
  readonly userPayload: string;
};

/** Multimodal invocation: caller provides its own messages (text + images). */
export type StructuredLlmInvocationWithMessages<TOutput> = BaseInvocation<TOutput> & {
  readonly messages: ReadonlyArray<StructuredLlmMessage>;
};

/**
 * Wraps the boilerplate every LLM call site in this package needs around
 * `generateObject`: per-request model resolution, telemetry wiring,
 * retry policy, abort-signal forwarding, post-parse validation, and an
 * optional `postProcess` hook (used by composeBrief to apply the
 * citation filter on the parsed output).
 *
 * Centralising the call shape lets the steps focus on the prompt + result
 * handling and ensures every LLM call site picks up future infrastructure
 * changes (telemetry tags, retry policy, abort plumbing) automatically.
 */
export async function runStructuredLlm<TOutput>(
  invocation: StructuredLlmInvocation<TOutput>,
): Promise<TOutput> {
  return runStructuredLlmWithMessages({
    ...invocation,
    messages: [{ role: "user", content: [{ type: "text", text: invocation.userPayload }] }],
  });
}

/**
 * Variant accepting multimodal messages (used by image-bearing
 * extractors). Wraps model resolution, the `generateText` call, the
 * defensive `schema.parse`, AND the optional `postProcess` hook in
 * `runWithErrorContext` — every error path between the call site and
 * the LLM (provider key missing, network failure, schema-parse
 * failure, citation-filter throw) surfaces with the same step + schema
 * + provider triage tuple so on-call grep finds the failing seam in
 * one place.
 *
 * `resolveLanguageModel` is wrapped with a `null` provider/model
 * because the resolver itself is what may fail — at that point the
 * concrete provider/model that would have been chosen is unknowable.
 * The error message renders them as `provider=unresolved model=unresolved`
 * so an on-call operator can grep for the resolver-stage failure mode
 * specifically. Once resolution succeeds, subsequent wraps use the
 * real `config` and the message names the actual provider that tripped.
 */
export async function runStructuredLlmWithMessages<TOutput>(
  invocation: StructuredLlmInvocationWithMessages<TOutput>,
): Promise<TOutput> {
  const resolved = await runWithErrorContext(invocation, null, () =>
    Promise.resolve(resolveLanguageModel({ env: invocation.env, kind: invocation.modelKind })),
  );
  const generateArgs = buildGenerateArgs(invocation, resolved.model, resolved.config);
  const result = await runWithErrorContext(invocation, resolved.config, () =>
    generateText(
      invocation.abortSignal
        ? { ...generateArgs, abortSignal: invocation.abortSignal }
        : generateArgs,
    ),
  );
  /**
   * `result.output` is the parsed-and-validated object emitted by
   * `Output.object`. The SDK throws `NoObjectGeneratedError` on parse /
   * validation failure before this line, so the local `schema.parse`
   * below is a defensive re-validation that also runs the Zod schema's
   * transforms and refinements (no-op for our schemas today, but cheap
   * insurance against a future schema gaining a `.transform`).
   * `postProcess` runs inside the same wrap so a downstream citation
   * filter or normalizer throw surfaces with the triage tuple too.
   */
  return runWithErrorContext(invocation, resolved.config, async () => {
    const parsed = invocation.schema.parse(result.output);
    return invocation.postProcess ? invocation.postProcess(parsed) : parsed;
  });
}

/**
 * Wraps the `generateText` call (and the post-parse) so any SDK,
 * provider, or schema error surfaces with the step + schema + provider
 * tuple in its message. Raw SDK errors are otherwise opaque on-call
 * ("AI_APICallError: 500", "ZodError: [...]") and forced operators to
 * grep correlation IDs to find which step / model tripped. Mirrors the
 * contextual wrapping `upsertSignal` and `persistBrief` apply to D1
 * errors. `AbortError` and `DOMException(name="AbortError")` pass
 * through unchanged so cancel semantics are preserved.
 */
async function runWithErrorContext<TOutput, TResult>(
  invocation: StructuredLlmInvocationWithMessages<TOutput>,
  config: ModelConfig | null,
  invoke: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await invoke();
  } catch (cause) {
    if (isAbortError(cause)) {
      throw cause;
    }
    const providerLabel = config?.provider ?? "unresolved";
    const modelLabel = config?.model ?? "unresolved";
    throw new Error(
      `runStructuredLlm failed (step=${invocation.stepName} schema=${invocation.schemaName} provider=${providerLabel} model=${modelLabel}): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
}

/** True for both `AbortError` instances and `DOMException(name="AbortError")`. */
function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === "AbortError";
}

/**
 * OpenAI's Responses API rejects `text.format.name` values containing
 * dots (`/^[a-zA-Z0-9_-]+$/`). Our internal `schemaName` convention
 * uses `<stepName>.<role>` (e.g. `extractCreatorIdDoc.extract`) for
 * mock-response keying and telemetry. Sanitise here so the canonical
 * name stays the same everywhere except on the provider wire.
 */
function sanitizeSchemaName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildGenerateArgs<TOutput>(
  invocation: StructuredLlmInvocationWithMessages<TOutput>,
  model: LanguageModelV3,
  config: ModelConfig,
) {
  return {
    model,
    output: Output.object({
      schema: invocation.schema,
      name: sanitizeSchemaName(invocation.schemaName),
    }),
    system: invocation.system,
    messages: invocation.messages.map((message) => ({
      role: message.role,
      content: message.content.map((part) =>
        part.type === "text"
          ? { type: "text" as const, text: part.text }
          : toImagePart(part.image, invocation.stepName),
      ),
    })),
    maxRetries: MAX_RETRIES,
    experimental_telemetry: makeTelemetry({
      stepName: invocation.stepName,
      callPurpose: callPurposeFor(invocation.modelKind),
      runtimeContext: invocation.ctx,
      provider: config.provider,
      model: config.model,
    }),
  };
}

function callPurposeFor(kind: ModelKind): "extract" | "compose" {
  return kind === "compose" ? "compose" : "extract";
}
