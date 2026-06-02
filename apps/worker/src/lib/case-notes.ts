import { and, asc, eq, sql } from "drizzle-orm";
import { caseNotes, cases, reviewer_actions, type Db } from "@mizan/db";
import {
  TERMINAL_CASE_STATUSES,
  type CaseNote,
  type NoteAuthorRole,
  type NoteVisibility,
  type ViewerContext,
} from "@mizan/shared";

const TERMINAL_STATUS_SET = new Set<string>(TERMINAL_CASE_STATUSES);

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
    visibility: r.visibility,
    body: r.body,
    createdAt: r.createdAt.getTime(),
  }));
}

/**
 * KTD-5: a non-terminal case needs reviewer attention when a CLIENT-authored
 * `client_facing` note is newer than the latest reviewer action. No reviewer
 * action yet is treated as epoch-0, so a note on a brand-new case counts; a
 * strict `>` makes an exact tie false. The note subquery filters
 * `author_role = 'client'` so a reviewer's own `client_facing` message can
 * never falsely flag the case as client-responded.
 */
export async function clientResponded(db: Db, caseId: string): Promise<boolean> {
  const row = await db
    .select({
      status: cases.status,
      noteMax: sql<
        number | null
      >`(SELECT MAX(${caseNotes.created_at}) FROM ${caseNotes} WHERE ${caseNotes.case_id} = ${caseId} AND ${caseNotes.author_role} = 'client' AND ${caseNotes.visibility} = 'client_facing')`,
      actionMax: sql<number>`COALESCE((SELECT MAX(${reviewer_actions.acted_at}) FROM ${reviewer_actions} WHERE ${reviewer_actions.case_id} = ${caseId}), 0)`,
    })
    .from(cases)
    .where(eq(cases.id, caseId))
    .get();
  if (!row) return false;
  if (TERMINAL_STATUS_SET.has(row.status)) return false;
  if (row.noteMax === null) return false;
  return row.noteMax > row.actionMax;
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
