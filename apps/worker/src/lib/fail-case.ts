import { batchTransitionWithEmits, buildStatusChangedEmits, cases, eq, type Db } from "@mizan/db";

const FAIL_SOURCES = ["QUEUED", "RUNNING"] as const;

/**
 * Flips a case to FAILED — guarded by the pinned `runId` and
 * `status ∈ {QUEUED, RUNNING}` — and emits the StatusChanged event so live
 * SSE subscribers see it leave the in-flight state (push-only). The current
 * status + org are read first so the emit carries an accurate `from_status`
 * and tenant; the emit only fires if the guarded transition actually matched.
 * Returns true when the row moved.
 *
 * Shared by the DLQ consumer (retry exhaustion) and the Mode A brief stream
 * (workflow threw mid-stream): both terminal-failure paths must fail a case
 * identically and never leave it stuck in RUNNING, which the producer guard
 * rejects as a retry source (`ALLOWED_RUNNING_SOURCES`) — a stuck-RUNNING row
 * can never be re-briefed from the UI, so it would brick the case.
 */
export async function failCaseToFailed(db: Db, caseId: string, runId: string): Promise<boolean> {
  const caseRow = await db
    .select({ status: cases.status, organization_id: cases.organization_id })
    .from(cases)
    .where(eq(cases.id, caseId))
    .get();
  const emits = caseRow
    ? buildStatusChangedEmits({
        caseId,
        organizationId: caseRow.organization_id,
        fromStatus: caseRow.status,
        toStatus: "FAILED",
        actorUserId: null,
      })
    : [];
  const updated = await batchTransitionWithEmits(
    db,
    { caseId, runId, from: [...FAIL_SOURCES], to: "FAILED" },
    emits,
  );
  return Boolean(updated);
}
