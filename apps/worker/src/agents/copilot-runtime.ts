import { CHAT_CONTEXT_KEYS, type CopilotRuntimeBag, type RequestContext } from "@mizan/mastra";
import type { Db } from "@mizan/db";
import { ViewerContextSchema } from "@mizan/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDb(value: unknown): value is Db {
  if (!isRecord(value)) return false;
  return typeof value["select"] === "function";
}

/** Reads viewer + db handles injected by the chat route request context. */
export function parseCopilotRuntime(requestContext: RequestContext | undefined): CopilotRuntimeBag {
  if (!requestContext) throw new Error("requestContext missing");
  const viewer = ViewerContextSchema.parse(requestContext.get("viewer"));
  const dbValue = requestContext.get("db");
  if (!isDb(dbValue)) throw new Error("requestContext.db missing");
  const rawCaseId = requestContext.get(CHAT_CONTEXT_KEYS.caseId);
  const pageCaseId = typeof rawCaseId === "string" && rawCaseId.length > 0 ? rawCaseId : undefined;
  return pageCaseId ? { viewer, db: dbValue, pageCaseId } : { viewer, db: dbValue };
}
