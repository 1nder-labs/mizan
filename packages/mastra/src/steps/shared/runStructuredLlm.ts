import { generateText, Output } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { z } from "zod";
import { SpanType, type TracingContext } from "@mastra/core/observability";
import { resolveLanguageModel } from "../../runtime/model-resolver.ts";
import { makeTelemetry } from "../../runtime/telemetry.ts";
import type { CloudflareBindings } from "@mizan/shared";
import type { ModelConfig, ModelKind } from "../../models/factory.ts";
import type { MizanRuntimeContext } from "../../observability/runtime-context.ts";
import { toFilePart, toImagePart } from "../../util/image-format.ts";

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
    | { readonly type: "file"; readonly data: Uint8Array; readonly mediaType: string }
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
  /**
   * The owning step's tracing context. When present, the `generateText`
   * call is wrapped in a `MODEL_GENERATION` child span so token usage +
   * cost surface as a Langfuse generation nested under the step (raw AI
   * SDK calls are otherwise invisible to Mastra's native exporter).
   */
  readonly tracingContext?: TracingContext | undefined;
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
  const result = await runWithErrorContext(invocation, resolved.config, () => {
    const generateArgs = buildGenerateArgs(invocation, resolved.model, resolved.config);
    return runTracedGeneration(invocation, generateArgs, resolved.config);
  });
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
 * Wraps the `generateText` call, the message-part construction, AND the
 * post-parse so any SDK, provider, schema, or document-encoding error
 * surfaces with the step + schema + provider tuple in its message. The
 * tuple is also written to `console.error` before the rethrow: a
 * mid-stream step failure is serialised by the workflow stream as a bare
 * `{ status: "failed" }` with no error text, so without this log the
 * cause is invisible to both the reviewer and on-call — the log makes it
 * one `tail` away. Raw SDK errors are otherwise opaque ("AI_APICallError:
 * 500", "ZodError: [...]") and forced operators to grep correlation IDs
 * to find which step / model tripped. Mirrors the contextual wrapping
 * `upsertSignal` and `persistBrief` apply to D1 errors. `AbortError` and
 * `DOMException(name="AbortError")` pass through unchanged so cancel
 * semantics are preserved.
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
    const message = `runStructuredLlm failed (step=${invocation.stepName} schema=${invocation.schemaName} provider=${providerLabel} model=${modelLabel}): ${
      cause instanceof Error ? cause.message : String(cause)
    }`;
    console.error(message, cause instanceof Error ? (cause.stack ?? cause.message) : cause);
    throw new Error(message, { cause });
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

/** Maps the AI SDK usage onto Mastra's `UsageStats` (omitting absent counts). */
function buildUsageAttributes(usage: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}): { usage: { inputTokens?: number; outputTokens?: number } } {
  return {
    usage: {
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    },
  };
}

/**
 * Runs `generateText` under two nested Mastra spans:
 *
 *   GENERIC `<stepName>`  →  MODEL_GENERATION `<stepName>.<purpose>`
 *
 * The exporter hard-codes the generation's display name to `chat <model>`
 * (`getSpanName` uses `gen_ai.operation` + the model), so the model call
 * alone never reveals which step it belongs to. The GENERIC parent uses its
 * `name` verbatim, so the trace tree reads `extractCreatorIdDoc → chat
 * <model>`. The MODEL_GENERATION span still carries token usage so the
 * generation is costed. No-ops cleanly when no tracing context is present.
 */
async function runTracedGeneration<TOutput>(
  invocation: StructuredLlmInvocationWithMessages<TOutput>,
  generateArgs: ReturnType<typeof buildGenerateArgs<TOutput>>,
  config: ModelConfig,
) {
  const stepSpan = invocation.tracingContext?.currentSpan?.createChildSpan({
    name: invocation.stepName,
    type: SpanType.GENERIC,
    entityName: invocation.stepName,
    input: { system: invocation.system },
  });
  const genSpan = (stepSpan ?? invocation.tracingContext?.currentSpan)?.createChildSpan({
    name: `${invocation.stepName}.${callPurposeFor(invocation.modelKind)}`,
    type: SpanType.MODEL_GENERATION,
    entityName: invocation.stepName,
    input: { messages: invocation.messages },
    attributes: { model: config.model, provider: config.provider },
  });
  try {
    const result = await generateText(
      invocation.abortSignal
        ? { ...generateArgs, abortSignal: invocation.abortSignal }
        : generateArgs,
    );
    genSpan?.end({ output: result.output, attributes: buildUsageAttributes(result.usage) });
    stepSpan?.end({ output: result.output });
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    genSpan?.error({ error });
    stepSpan?.error({ error });
    throw cause;
  }
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
      content: message.content.map((part) => {
        if (part.type === "text") return { type: "text" as const, text: part.text };
        if (part.type === "file") return toFilePart(part.data, part.mediaType);
        return toImagePart(part.image, invocation.stepName);
      }),
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
