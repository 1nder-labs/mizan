import { and, asc, desc, eq } from "drizzle-orm";
import { caseNotes, cases, latestDocumentUploadMs, reviewer_actions, type Db } from "@mizan/db";
import {
  type CaseNote,
  type NoteAuthorRole,
  type NoteVisibility,
  type ReviewerAction,
  type ViewerContext,
} from "@mizan/shared";

interface NoteWrite {
  readonly caseId: string;
  readonly organizationId: string;
  readonly authorUserId: string;
  readonly authorRole: NoteAuthorRole;
  readonly visibility: NoteVisibility;
  readonly body: string;
}

/**
 * Inserts one note. `authorRole` and `visibility` are supplied by the caller
 * (route-derived from the session role + the endpoint), NEVER from the request
 * body — that is the channel's security boundary.
 */
export async function writeCaseNote(db: Db, input: NoteWrite): Promise<void> {
  await db.insert(caseNotes).values({
    case_id: input.caseId,
    organization_id: input.organizationId,
    author_user_id: input.authorUserId,
    author_role: input.authorRole,
    visibility: input.visibility,
    body: input.body,
  });
}

/**
 * Reads a case's notes, visibility-scoped by role: a client sees only
 * `client_facing` notes; reviewers/admins see all. Always org-scoped. Per-case
 * ownership for a client is enforced by the calling route (loadOwnedCampaign)
 * before this runs — this helper never widens that boundary.
 */
export async function readCaseNotes(
  db: Db,
  viewer: ViewerContext,
  caseId: string,
): Promise<CaseNote[]> {
  const filters = [
    eq(caseNotes.case_id, caseId),
    eq(caseNotes.organization_id, viewer.organizationId),
  ];
  if (viewer.role === "client") filters.push(eq(caseNotes.visibility, "client_facing"));
  const rows = await db
    .select({
      id: caseNotes.id,
      authorRole: caseNotes.author_role,
      authorUserId: caseNotes.author_user_id,
      visibility: caseNotes.visibility,
      body: caseNotes.body,
      createdAt: caseNotes.created_at,
    })
    .from(caseNotes)
    .where(and(...filters))
    .orderBy(asc(caseNotes.created_at))
    .all();
  return rows.map((r) => ({
    id: r.id,
    authorRole: r.authorRole,
    authorUserId: r.authorUserId,
    visibility: r.visibility,
    body: r.body,
    createdAt: r.createdAt.getTime(),
  }));
}

/**
 * The case's most recent reviewer action (by `acted_at`), or null when none.
 * Shared by `clientResponded` and the portal evidence gate so both read the
 * same "what did the reviewer last decide" signal in one place.
 */
export async function latestReviewerAction(
  db: Db,
  caseId: string,
): Promise<{ action: ReviewerAction; actedAtMs: number } | null> {
  const row = await db
    .select({ action: reviewer_actions.action, actedAt: reviewer_actions.acted_at })
    .from(reviewer_actions)
    .where(eq(reviewer_actions.case_id, caseId))
    .orderBy(desc(reviewer_actions.acted_at))
    .limit(1)
    .get();
  return row ? { action: row.action, actedAtMs: row.actedAt.getTime() } : null;
}

/**
 * Reviewer actions that hand the ball back to the client — a doc request or an
 * escalation that invites more from the campaign owner. MUST stay in sync with
 * `deriveCaseDisposition`, whose precedence maps BOTH `REQUEST_DOCS + responded`
 * and `ESCALATE + responded` to `CLIENT_REPLIED`. Keying only off REQUEST_DOCS
 * left the ESCALATE branch permanently dead — a client reply to an escalated
 * case never registered, so the client saw "under further review" forever.
 */
const CLIENT_AWAITING_ACTIONS = new Set<ReviewerAction>(["REQUEST_DOCS", "ESCALATE"]);

/** True when a reviewer action hands the ball back to the client (doc request / escalation). */
export function isClientAwaitingAction(action: ReviewerAction | null): boolean {
  return action !== null && CLIENT_AWAITING_ACTIONS.has(action);
}

/**
 * True when a re-submit would meaningfully re-enter review: the reviewer awaits
 * the client (REQUEST_DOCS / ESCALATE) AND a document was uploaded/replaced
 * strictly after that request. Shared by the client detail (button gate) and the
 * `/submit` route (authoritative re-stamp gate) so UI + server never disagree.
 */
export async function canResubmit(
  db: Db,
  organizationId: string,
  caseId: string,
  latest: { action: ReviewerAction; actedAtMs: number } | null,
): Promise<boolean> {
  if (!latest || !isClientAwaitingAction(latest.action)) return false;
  const lastUpload = await latestDocumentUploadMs(db, caseId, organizationId);
  return lastUpload !== null && lastUpload > latest.actedAtMs;
}

/**
 * Pure rule: the client has handed the case back to the reviewer when the
 * reviewer's latest action awaits client input (REQUEST_DOCS / ESCALATE) and the
 * client has since RE-SUBMITTED — i.e. `cases.submitted_at` was re-stamped to a
 * time STRICTLY newer than that action. Conversation notes AND evidence uploads
 * deliberately do NOT flip this signal; only an explicit re-submission does, so
 * a back-and-forth chat (or a half-finished upload) never trips the reviewer's
 * re-trigger. Both inputs are epoch-ms. The strict `>` re-arms per request: a
 * second awaiting-action resets the bar until a newer re-submit lands.
 */
export function isClientResponded(
  latest: { action: ReviewerAction; actedAtMs: number } | null,
  submittedAtMs: number | null,
): boolean {
  if (!latest || !CLIENT_AWAITING_ACTIONS.has(latest.action)) return false;
  return submittedAtMs !== null && submittedAtMs > latest.actedAtMs;
}

/** True when the case exists within the given org — the reviewer cross-org write guard. */
export async function caseInViewerOrg(
  db: Db,
  caseId: string,
  organizationId: string,
): Promise<boolean> {
  const row = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.organization_id, organizationId)))
    .get();
  return row !== undefined;
}
