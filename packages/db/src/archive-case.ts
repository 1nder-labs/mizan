import { and, eq } from "drizzle-orm";
import { buildArchivedEmits, emitLiveEventsBestEffort } from "./live-event-builders.ts";
import { cases } from "./schema.ts";
import type { Db } from "./index.ts";

interface ArchiveCaseInput {
  readonly caseId: string;
  readonly organizationId: string;
  readonly archived: boolean;
  readonly actorUserId: string;
}

/**
 * Sets or clears `archived_at` for an org-scoped case and fans the
 * `case.archived` live event to the org + case topics. The ONE place archive
 * state changes — the manual archive route and the BLOCK auto-archive chain both
 * route through it so their side effects (the returning-guard 404 signal + the
 * SSE emit) can never drift apart. Returns `false` when the id/org pair matched
 * no row so the caller can 404; the emit is best-effort (observability, never
 * rolls back the archive).
 */
export async function archiveCase(db: Db, input: ArchiveCaseInput): Promise<boolean> {
  const updated = await db
    .update(cases)
    .set({ archived_at: input.archived ? new Date() : null })
    .where(and(eq(cases.id, input.caseId), eq(cases.organization_id, input.organizationId)))
    .returning({ id: cases.id });
  if (updated.length === 0) return false;
  await emitLiveEventsBestEffort(
    db,
    buildArchivedEmits({
      caseId: input.caseId,
      organizationId: input.organizationId,
      archived: input.archived,
      actorUserId: input.actorUserId,
    }),
  );
  return true;
}
