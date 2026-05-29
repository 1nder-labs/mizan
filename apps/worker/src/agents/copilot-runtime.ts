import type { CopilotRuntimeBag, RequestContext } from "@mizan/mastra";
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
  return { viewer, db: dbValue };
}
