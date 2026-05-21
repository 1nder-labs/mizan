/**
 * Native Mastra Langfuse exporter wiring.
 *
 * Mastra 1.32+ ships `@mastra/langfuse` as a first-class observability
 * exporter — wire it via `Mastra({ observability: { configs: { langfuse: …} } })`.
 * This replaces the earlier `@vercel/otel` + `langfuse-vercel` AI-SDK
 * route, which was the correct shape for raw AI-SDK apps but bypassed
 * Mastra's workflow-aware span propagation.
 *
 * Activates only when BOTH `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`
 * are present in the environment — local dev without Langfuse credentials
 * runs with observability inert (the exporter array stays empty and Mastra
 * skips the OTel registration step entirely).
 */

import { LangfuseExporter } from "@mastra/langfuse";
import type { CloudflareBindings } from "@mizan/worker/env";

/** Returns a configured exporter or null when credentials are missing. */
export function buildLangfuseExporter(env: CloudflareBindings): LangfuseExporter | null {
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return null;
  return new LangfuseExporter({
    publicKey,
    secretKey,
    environment: "development",
    ...(env.LANGFUSE_HOST ? { baseUrl: env.LANGFUSE_HOST } : {}),
  });
}

export { LangfuseExporter };
