import { and, asc, desc, eq, sql } from "drizzle-orm";
import { caseNotes, cases, reviewer_actions, type Db } from "@mizan/db";
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
 * KTD-5: a case needs reviewer attention when the reviewer's LATEST action was
 * REQUEST_DOCS and the client has since added a `client_facing` note newer than
 * that action. Reviewer actions are terminal (every action, REQUEST_DOCS
 * included, flips the case to ACTIONED), so the signal keys off the action TYPE
 * — a case-status gate would treat every doc-request response as "closed" and
 * never fire. The strict `>` re-arms per request: a second REQUEST_DOCS resets
 * the bar until a newer client note arrives, so the re-brief loop never
 * double-flags. The note subquery filters `author_role = 'client'` so a
 * reviewer's own `client_facing` message can never self-flag the case.
 */
export async function clientResponded(db: Db, caseId: string): Promise<boolean> {
  const latest = await latestReviewerAction(db, caseId);
  if (!latest || latest.action !== "REQUEST_DOCS") return false;
  const noteRow = await db
    .select({ max: sql<number | null>`MAX(${caseNotes.created_at})` })
    .from(caseNotes)
    .where(
      and(
        eq(caseNotes.case_id, caseId),
        eq(caseNotes.author_role, "client"),
        eq(caseNotes.visibility, "client_facing"),
      ),
    )
    .get();
  const noteMax = noteRow?.max ?? null;
  return noteMax !== null && noteMax > latest.actedAtMs;
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
