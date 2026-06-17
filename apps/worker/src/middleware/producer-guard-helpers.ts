import {
  buildStatusChangedEmits,
  cases,
  emitLiveEventsBestEffort,
  eq,
  inArray,
  and,
  type Db,
} from "@mizan/db";
import type { Case } from "@mizan/db";
import type { CaseStatus } from "@mizan/shared";

/**
 * Claims a producer target and returns the post-claim row, or null on race loss.
 * Target is always "QUEUED" — the only caller (`briefProducerGuard`) passes this
 * literal. The `claimCaseRunning` path was removed as dead code (no caller ever
 * passed `target: "RUNNING"`).
 */
export async function claimProducerCase(
  db: Db,
  input: {
    readonly caseId: string;
    readonly target: "QUEUED";
    readonly fromStatus: CaseStatus;
    readonly organizationId: string;
    readonly actorUserId: string;
    readonly sources: readonly Case["status"][];
  },
): Promise<{ runId: string; row: Case } | null> {
  const runId = crypto.randomUUID();
  const row = await claimCaseQueued(
    db,
    input.caseId,
    runId,
    input.fromStatus,
    input.organizationId,
    input.actorUserId,
    input.sources,
  );
  if (!row) return null;
  return { runId, row };
}

async function claimCaseQueued(
  db: Db,
  caseId: string,
  runId: string,
  fromStatus: CaseStatus,
  organizationId: string,
  actorUserId: string,
  sources: readonly Case["status"][],
): Promise<Case | undefined> {
  const updated = await db
    .update(cases)
    .set({ status: "QUEUED", current_run_id: runId, updated_at: new Date() })
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organization_id, organizationId),
        inArray(cases.status, [...sources]),
      ),
    )
    .returning();
  const row = updated[0];
  if (!row) return undefined;
  await emitLiveEventsBestEffort(
    db,
    buildStatusChangedEmits({
      caseId,
      organizationId,
      fromStatus,
      toStatus: "QUEUED",
      actorUserId,
    }),
  );
  return row;
}
