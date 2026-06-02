import type { Context } from "hono";
import { ViewerContextSchema, type ViewerContext } from "@mizan/shared";
import type { CloudflareBindings } from "../env.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

/**
 * Extracts the canonical viewer from Hono context after `requireRole` ran.
 */
export function extractViewer(
  c: Context<{ Bindings: CloudflareBindings; Variables: ViewerVariables }>,
): ViewerContext {
  return ViewerContextSchema.parse(c.var.viewer);
}
