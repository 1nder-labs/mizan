import {
  buildStatusChangedEmits,
  cases,
  emitLiveEvent,
  eq,
  inArray,
  and,
  type Db,
} from "@mizan/db";
import type { Case } from "@mizan/db";
import type { CaseStatus } from "@mizan/shared";

/**
 * Claims a producer target and returns the post-claim row, or null on race loss.
 */
export async function claimProducerCase(
  db: Db,
  input: {
    readonly caseId: string;
    readonly target: "RUNNING" | "QUEUED";
    readonly fromStatus: CaseStatus;
    readonly organizationId: string;
    readonly actorUserId: string;
    readonly sources: readonly Case["status"][];
  },
): Promise<{ runId: string; row: Case } | null> {
  const runId = crypto.randomUUID();
  if (input.target === "QUEUED") {
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
  const row = await claimCaseRunning(db, input.caseId, runId, input.target, input.sources, {
    fromStatus: input.fromStatus,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });
  if (!row || row.current_run_id !== runId) return null;
  return { runId, row };
}

export async function claimCaseQueued(
  db: Db,
  caseId: string,
  runId: string,
  fromStatus: CaseStatus,
  organizationId: string,
  actorUserId: string,
  sources: readonly Case["status"][],
): Promise<Case | undefined> {
  const emits = buildStatusChangedEmits({
    caseId,
    organizationId,
    fromStatus,
    toStatus: "QUEUED",
    actorUserId,
  });
  await db.batch([
    db
      .update(cases)
      .set({ status: "QUEUED", current_run_id: runId, updated_at: new Date() })
      .where(
        and(
          eq(cases.id, caseId),
          eq(cases.organization_id, organizationId),
          inArray(cases.status, [...sources]),
        ),
      ),
    ...emits.map((emit) => emitLiveEvent(db, emit)),
  ]);
  const row = await db.select().from(cases).where(eq(cases.id, caseId)).get();
  if (!row || row.status !== "QUEUED" || row.current_run_id !== runId) return undefined;
  return row;
}

/**
 * Atomically claims a case for Mode A streaming with live-event fan-out.
 */
export async function claimCaseRunning(
  db: Db,
  caseId: string,
  runId: string,
  target: Case["status"],
  sources: readonly Case["status"][],
  emitContext: {
    readonly fromStatus: CaseStatus;
    readonly organizationId: string;
    readonly actorUserId: string;
  },
): Promise<Case | undefined> {
  const emits = buildStatusChangedEmits({
    caseId,
    organizationId: emitContext.organizationId,
    fromStatus: emitContext.fromStatus,
    toStatus: target,
    actorUserId: emitContext.actorUserId,
  });
  await db.batch([
    db
      .update(cases)
      .set({ status: target, current_run_id: runId, updated_at: new Date() })
      .where(
        and(
          eq(cases.id, caseId),
          eq(cases.organization_id, emitContext.organizationId),
          inArray(cases.status, [...sources]),
        ),
      ),
    ...emits.map((emit) => emitLiveEvent(db, emit)),
  ]);
  const row = await db.select().from(cases).where(eq(cases.id, caseId)).get();
  if (!row || row.status !== target || row.current_run_id !== runId) return undefined;
  return row;
}
