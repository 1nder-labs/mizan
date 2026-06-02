import { and, eq, inArray } from "drizzle-orm";
import type { CaseStatus, LiveEventPayload, ReviewerAction } from "@mizan/shared";
import { emitLiveEvent, type EmitLiveEventInput } from "./emit-live-event.ts";
import { cases } from "./schema.ts";
import type { Case } from "./schemas.ts";
import type { Db } from "./index.ts";

export function orgTopic(organizationId: string): string {
  return `org:${organizationId}`;
}

export function userTopic(userId: string): string {
  return `user:${userId}`;
}

export function caseTopic(caseId: string): string {
  return `case:${caseId}`;
}

/** Fans one payload to the org topic and the case topic. */
function fanOrgCase(
  base: Omit<EmitLiveEventInput, "topic">,
  organizationId: string,
  caseId: string,
): EmitLiveEventInput[] {
  return [
    { ...base, topic: orgTopic(organizationId) },
    { ...base, topic: caseTopic(caseId) },
  ];
}

interface StatusChangedInput {
  readonly caseId: string;
  readonly organizationId: string;
  readonly fromStatus: CaseStatus;
  readonly toStatus: CaseStatus;
  readonly actorUserId: string | null;
}

/**
 * Builds org + case topic emits for a case status transition.
 */
export function buildStatusChangedEmits(input: StatusChangedInput): EmitLiveEventInput[] {
  const payload: LiveEventPayload = {
    event_type: "case.status_changed",
    case_id: input.caseId,
    from_status: input.fromStatus,
    to_status: input.toStatus,
  };
  const base = {
    eventType: payload.event_type,
    payload,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  } satisfies Omit<EmitLiveEventInput, "topic">;
  return fanOrgCase(base, input.organizationId, input.caseId);
}

interface AssignmentEmitInput {
  readonly caseId: string;
  readonly organizationId: string;
  readonly previousAssignee: string | null;
  readonly nextAssignee: string | null;
  readonly actorUserId: string;
  readonly actorEmail: string;
}

/**
 * Builds live-event inputs for assign / unassign mutations.
 */
export function buildAssignmentEmits(input: AssignmentEmitInput): EmitLiveEventInput[] {
  const emits: EmitLiveEventInput[] = [];
  if (input.nextAssignee) {
    const payload: LiveEventPayload = {
      event_type: "case.assigned",
      case_id: input.caseId,
      assigned_to: input.nextAssignee,
      actor_user_id: input.actorUserId,
      actor_email: input.actorEmail,
    };
    emits.push(
      {
        topic: orgTopic(input.organizationId),
        eventType: payload.event_type,
        payload,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
      },
      {
        topic: userTopic(input.nextAssignee),
        eventType: payload.event_type,
        payload,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
      },
    );
  }
  if (input.previousAssignee && input.previousAssignee !== input.nextAssignee) {
    const payload: LiveEventPayload = {
      event_type: "case.unassigned",
      case_id: input.caseId,
      previous_assignee: input.previousAssignee,
      actor_user_id: input.actorUserId,
      actor_email: input.actorEmail,
    };
    emits.push({
      topic: userTopic(input.previousAssignee),
      eventType: payload.event_type,
      payload,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
    });
  }
  return emits;
}

interface ActionEmitInput {
  readonly caseId: string;
  readonly organizationId: string;
  readonly actionId: string;
  readonly reviewerId: string;
  readonly action: ReviewerAction;
}

/**
 * Builds org-scoped emits after a reviewer action commits.
 */
export function buildActionEmits(input: ActionEmitInput): EmitLiveEventInput[] {
  const actioned: LiveEventPayload = {
    event_type: "case.actioned",
    case_id: input.caseId,
    action: input.action,
    reviewer_id: input.reviewerId,
  };
  const audit: LiveEventPayload = {
    event_type: "audit.new",
    case_id: input.caseId,
    action_id: input.actionId,
    reviewer_id: input.reviewerId,
  };
  const org = orgTopic(input.organizationId);
  const shared = {
    organizationId: input.organizationId,
    actorUserId: input.reviewerId,
  };
  return [
    { topic: org, eventType: actioned.event_type, payload: actioned, ...shared },
    { topic: org, eventType: audit.event_type, payload: audit, ...shared },
    {
      topic: caseTopic(input.caseId),
      eventType: actioned.event_type,
      payload: actioned,
      ...shared,
    },
  ];
}

/**
 * Fires live-event emits as one best-effort batch. Live events are
 * observability — a failed append must never roll back or 500 a committed
 * case transition (see the `actions.ts` post-action chain). Logs loudly on
 * failure; callers do not branch on the outcome.
 */
export async function emitLiveEventsBestEffort(
  db: Db,
  emits: readonly EmitLiveEventInput[],
): Promise<void> {
  if (emits.length === 0) return;
  try {
    const [first, ...rest] = emits.map((emit) => emitLiveEvent(db, emit));
    if (first) await db.batch([first, ...rest]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[live-events] best-effort emit failed (${emits.length} events): ${reason}`);
  }
}

/**
 * Transitions a case and emits live events ONLY when the guarded update
 * matched.
 *
 * The update uses `.returning()` so the matched row is the signal — not a
 * follow-up `SELECT` (which could observe another writer's status, a false
 * negative). A race-lost / stale call matches no row → returns `undefined`
 * and emits nothing, so subscribers never see a spurious transition for a
 * no-op update. On a real transition the emits fire best-effort AFTER the
 * commit: they are observability, not part of the transition's atomicity.
 */
export async function batchTransitionWithEmits(
  db: Db,
  transition: {
    readonly caseId: string;
    readonly runId: string;
    readonly from: Case["status"] | readonly Case["status"][];
    readonly to: Case["status"];
  },
  emits: readonly EmitLiveEventInput[],
): Promise<Case | undefined> {
  const sources = Array.isArray(transition.from) ? [...transition.from] : [transition.from];
  const updated = await db
    .update(cases)
    .set({ status: transition.to, updated_at: new Date() })
    .where(
      and(
        eq(cases.id, transition.caseId),
        eq(cases.current_run_id, transition.runId),
        inArray(cases.status, sources),
      ),
    )
    .returning();
  const row = updated[0];
  if (!row) return undefined;
  await emitLiveEventsBestEffort(db, emits);
  return row;
}

interface SignalPersistedInput {
  readonly caseId: string;
  readonly runId: string;
  readonly organizationId: string;
  readonly signalType: string;
}

/**
 * Builds org + case emits when a workflow signal row is upserted.
 */
export function buildSignalPersistedEmits(input: SignalPersistedInput): EmitLiveEventInput[] {
  const payload: LiveEventPayload = {
    event_type: "signal.persisted",
    case_id: input.caseId,
    run_id: input.runId,
    signal_type: input.signalType,
  };
  const base = {
    eventType: payload.event_type,
    payload,
    organizationId: input.organizationId,
    actorUserId: null,
  } satisfies Omit<EmitLiveEventInput, "topic">;
  return fanOrgCase(base, input.organizationId, input.caseId);
}

interface BriefReadyInput {
  readonly caseId: string;
  readonly runId: string;
  readonly organizationId: string;
}

/**
 * Builds org + case emits when a brief row is persisted.
 */
export function buildBriefReadyEmits(input: BriefReadyInput): EmitLiveEventInput[] {
  const payload: LiveEventPayload = {
    event_type: "case.brief_ready",
    case_id: input.caseId,
    run_id: input.runId,
  };
  const base = {
    eventType: payload.event_type,
    payload,
    organizationId: input.organizationId,
    actorUserId: null,
  } satisfies Omit<EmitLiveEventInput, "topic">;
  return fanOrgCase(base, input.organizationId, input.caseId);
}
