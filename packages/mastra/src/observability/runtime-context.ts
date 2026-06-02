import { z } from "zod";
import { RequestContext } from "@mastra/core/di";

export const MizanRuntimeContextSchema = z.object({
  caseId: z.string(),
  runId: z.string(),
  reviewerId: z.string().nullable(),
  sessionId: z.string().nullable(),
  organizationId: z.string(),
  category: z.string(),
  geography: z.string(),
  langfuseEnabled: z.boolean(),
});

export type MizanRuntimeContext = z.infer<typeof MizanRuntimeContextSchema>;

export const MIZAN_CTX_KEY = "mizan_ctx";
export const MIZAN_ENV_KEY = "mizan_env";

/** Builds a Mastra RequestContext pre-populated with Mizan keys. */
export function makeRuntimeContext(input: MizanRuntimeContext): RequestContext {
  const rc = new RequestContext();
  rc.set(MIZAN_CTX_KEY, input);
  return rc;
}

/** Parses runtime metadata stored on the Mastra request context. */
export function parseMizanContext(value: unknown): MizanRuntimeContext {
  return MizanRuntimeContextSchema.parse(value);
}
