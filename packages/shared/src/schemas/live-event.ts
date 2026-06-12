import { z } from "zod";
import { CaseStatusEnum } from "./queue-search.ts";
import { ReviewerActionEnum } from "./reviewer-action.ts";

export const LiveEventTopicSchema = z.string().min(1);

export const LiveEventTypeEnum = z.enum([
  "case.status_changed",
  "case.assigned",
  "case.unassigned",
  "case.brief_ready",
  "case.actioned",
  "case.archived",
  "case.resubmitted",
  "audit.new",
  "signal.persisted",
  "workflow.event",
  "notification.new",
  "case.message_added",
]);

export type LiveEventType = z.infer<typeof LiveEventTypeEnum>;

const CaseStatusChangedPayloadSchema = z
  .object({
    event_type: z.literal("case.status_changed"),
    case_id: z.string(),
    from_status: CaseStatusEnum,
    to_status: CaseStatusEnum,
  })
  .strict();

const CaseAssignedPayloadSchema = z
  .object({
    event_type: z.literal("case.assigned"),
    case_id: z.string(),
    assigned_to: z.string(),
    actor_user_id: z.string(),
    actor_email: z.string(),
  })
  .strict();

const CaseUnassignedPayloadSchema = z
  .object({
    event_type: z.literal("case.unassigned"),
    case_id: z.string(),
    previous_assignee: z.string(),
    actor_user_id: z.string(),
    actor_email: z.string(),
  })
  .strict();

const CaseBriefReadyPayloadSchema = z
  .object({
    event_type: z.literal("case.brief_ready"),
    case_id: z.string(),
    run_id: z.string(),
  })
  .strict();

const CaseActionedPayloadSchema = z
  .object({
    event_type: z.literal("case.actioned"),
    case_id: z.string(),
    action: ReviewerActionEnum,
    reviewer_id: z.string(),
  })
  .strict();

const CaseArchivedPayloadSchema = z
  .object({
    event_type: z.literal("case.archived"),
    case_id: z.string(),
    archived: z.boolean(),
    actor_user_id: z.string(),
  })
  .strict();

const CaseResubmittedPayloadSchema = z
  .object({
    event_type: z.literal("case.resubmitted"),
    case_id: z.string(),
    actor_user_id: z.string(),
  })
  .strict();

const AuditNewPayloadSchema = z
  .object({
    event_type: z.literal("audit.new"),
    case_id: z.string(),
    action_id: z.string(),
    reviewer_id: z.string(),
  })
  .strict();

const SignalPersistedPayloadSchema = z
  .object({
    event_type: z.literal("signal.persisted"),
    case_id: z.string(),
    run_id: z.string(),
    signal_type: z.string(),
  })
  .strict();

const WorkflowEventPayloadSchema = z
  .object({
    event_type: z.literal("workflow.event"),
    case_id: z.string(),
    run_id: z.string(),
    workflow_event_type: z.string(),
  })
  .strict();

const NotificationNewPayloadSchema = z
  .object({
    event_type: z.literal("notification.new"),
    notification_id: z.string(),
    user_id: z.string(),
  })
  .strict();

const CaseMessageAddedPayloadSchema = z
  .object({
    event_type: z.literal("case.message_added"),
    case_id: z.string(),
  })
  .strict();

export const LiveEventPayloadSchema = z.discriminatedUnion("event_type", [
  CaseStatusChangedPayloadSchema,
  CaseAssignedPayloadSchema,
  CaseUnassignedPayloadSchema,
  CaseBriefReadyPayloadSchema,
  CaseActionedPayloadSchema,
  CaseArchivedPayloadSchema,
  CaseResubmittedPayloadSchema,
  AuditNewPayloadSchema,
  SignalPersistedPayloadSchema,
  WorkflowEventPayloadSchema,
  NotificationNewPayloadSchema,
  CaseMessageAddedPayloadSchema,
]);

export type LiveEventPayload = z.infer<typeof LiveEventPayloadSchema>;

export const LiveEventRowSchema = z
  .object({
    topic: LiveEventTopicSchema,
    seq: z.number().int().nonnegative(),
    event_type: LiveEventTypeEnum,
    payload: LiveEventPayloadSchema,
    emitted_at: z.number().int(),
    actor_user_id: z.string().nullable(),
    organization_id: z.string().nullable(),
  })
  .strict();

export type LiveEventRow = z.infer<typeof LiveEventRowSchema>;
