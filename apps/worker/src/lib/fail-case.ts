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
 * The terminal-failure path for a brief run: invoked by the DLQ consumer once
 * the queue exhausts retries. A failed attempt mid-run only reverts RUNNING →
 * QUEUED (the consumer retries from Mastra's last persisted step); FAILED is
 * reached only here, so the case never sticks in RUNNING — which the producer
 * guard rejects as a retry source (it only accepts `ALLOWED_SOURCES`:
 * DRAFT/FAILED), and a stuck-RUNNING row could never be re-briefed from the UI.
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
