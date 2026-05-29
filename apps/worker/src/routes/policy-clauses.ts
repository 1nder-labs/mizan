/**
 * Policy clause read route — Phase 7.5 U5.
 *
 * Serves the full clause body for a single `(source, clauseId)` pair
 * out of the bundled corpus JSON. The citation drawer (U12) calls
 * this when a reviewer clicks a chip in the brief prose. Vectorize is
 * not used — that index stores chunks (`source:clauseId:chunkIndex`),
 * not whole clauses.
 *
 * Auth gate: `reviewer | admin` (shared-queue model — matches the
 * existing case-detail surface). The route is auth-gated not because
 * clause bodies are confidential (the JSON is in the Worker bundle
 * already) but to keep clause enumeration off the anonymous surface.
 */
import { zValidator } from "@hono/zod-validator";
import { getClauseById } from "@mizan/mastra";
import {
  PolicyClauseErrorBodySchema,
  PolicyClauseQuerySchema,
  PolicyClauseResponseSchema,
  type PolicyClauseErrorCode,
} from "@mizan/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { CloudflareBindings } from "../env.ts";
import { requireRole } from "../middleware/require-role.ts";
import type { ViewerVariables } from "../middleware/require-role.ts";

const ParamSchema = z.object({ id: z.string().min(1) });

function clauseErrorBody(code: PolicyClauseErrorCode): { error: PolicyClauseErrorCode } {
  return PolicyClauseErrorBodySchema.parse({ error: code });
}

export const policyClauseRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: ViewerVariables;
}>()
  .use("*", requireRole(["reviewer", "admin"]))
  .get(
    "/clauses/:id",
    zValidator("param", ParamSchema),
    zValidator("query", PolicyClauseQuerySchema),
    (c) => {
      const { id } = c.req.valid("param");
      const { source } = c.req.valid("query");
      const clause = getClauseById(source, id);
      if (!clause) return c.json(clauseErrorBody("not_found"), 404);
      const body = PolicyClauseResponseSchema.parse({
        clauseId: clause.clauseId,
        source: clause.source,
        title: clause.title,
        body: clause.body,
        corpusVersion: clause.corpusVersion,
      });
      return c.json(body);
    },
  );
