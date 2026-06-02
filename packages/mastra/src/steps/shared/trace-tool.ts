import { SpanType, type TracingContext } from "@mastra/core/observability";

/**
 * Wraps a non-LLM tool / retrieval call (Vectorize search, reverse-image
 * lookup, etc.) in a Mastra `TOOL_CALL` span so it shows in the Langfuse
 * trace as `execute_tool <name>` with its input + output. `entityName` is
 * set to `name` because the exporter derives the span's display name from
 * the entity, not the `name` field. No-ops when no tracing context is
 * present (`currentSpan` undefined → span undefined).
 */
export async function traceTool<T>(
  tracingContext: TracingContext | undefined,
  name: string,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const span = tracingContext?.currentSpan?.createChildSpan({
    name,
    type: SpanType.TOOL_CALL,
    entityName: name,
    input,
  });
  try {
    const output = await fn();
    span?.end({ output });
    return output;
  } catch (cause) {
    span?.error({ error: cause instanceof Error ? cause : new Error(String(cause)) });
    throw cause;
  }
}
