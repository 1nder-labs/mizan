import { and, desc, eq, sql } from "drizzle-orm";
import {
  briefs,
  cases,
  currentExtractedKeys,
  reviewer_actions,
  type Db,
  type ExtractedDocumentKeys,
} from "@mizan/db";
import {
  BriefPayloadSchema,
  CaseOverlaySchema,
  ClientCaseDetailSchema,
  ClientStatusEnum,
  DocumentKeyEnum,
  ReviewerActionEnum,
  toClientStatus,
  type ClientCampaignSummary,
  type ClientCaseDetail,
  type ClientReviewRequest,
  type ReviewerAction,
  type ViewerContext,
} from "@mizan/shared";
import {
  canResubmit,
  isClientResponded,
  latestReviewerAction,
  readCaseNotes,
} from "./case-notes.ts";

type OwnedCampaign = typeof cases.$inferSelect;

function parseAction(raw: string | null): ReviewerAction | null {
  if (raw === null) return null;
  const parsed = ReviewerActionEnum.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Every past reviewer request for the case, newest first — one entry per
 * composed brief that carried a drafted organizer message. Powers the client's
 * review timeline; the newest entry is the active ask when the case still needs
 * evidence.
 */
async function fetchReviewHistory(
  db: Db,
  caseId: string,
  organizationId: string,
): Promise<ClientReviewRequest[]> {
  const rows = await db
    .select({ id: briefs.id, composedAt: briefs.composed_at, payload: briefs.payload_json })
    .from(briefs)
    .where(and(eq(briefs.case_id, caseId), eq(briefs.organization_id, organizationId)))
    .orderBy(desc(briefs.composed_at))
    .all();
  const out: ClientReviewRequest[] = [];
  for (const row of rows) {
    const parsed = BriefPayloadSchema.safeParse(row.payload);
    const ask = parsed.success ? parsed.data.drafted_organizer_message : undefined;
    if (ask) {
      out.push({
        id: row.id,
        at: row.composedAt.getTime(),
        message: ask.message,
        missingItems: ask.missing_items,
      });
    }
  }
  return out;
}

/** Per-slot upload state from the current document versions (non-empty key = uploaded). */
function buildEvidenceList(keys: ExtractedDocumentKeys) {
  return DocumentKeyEnum.options.map((docKind) => ({
    docKind,
    uploaded: keys[docKind].length > 0,
  }));
}

/**
 * Correlated subqueries that fold the latest reviewer action + its `acted_at`
 * into the list query (both raw `timestamp_ms`). The "client responded" signal
 * is then `submitted_at > acted_at` — an explicit re-submission, NOT a note — so
 * no note subquery is needed and the list stays at ONE query.
 */
function campaignSummaryColumns() {
  return {
    latestAction: sql<
      string | null
    >`(SELECT ${reviewer_actions.action} FROM ${reviewer_actions} WHERE ${reviewer_actions.case_id} = ${cases.id} ORDER BY ${reviewer_actions.acted_at} DESC LIMIT 1)`,
    latestActionAtMs: sql<
      number | null
    >`(SELECT ${reviewer_actions.acted_at} FROM ${reviewer_actions} WHERE ${reviewer_actions.case_id} = ${cases.id} ORDER BY ${reviewer_actions.acted_at} DESC LIMIT 1)`,
  };
}

/** Selects the viewer's own campaigns + the folded client-responded columns. */
function selectClientCampaignRows(db: Db, viewer: ViewerContext) {
  return db
    .select({
      id: cases.id,
      title: cases.title,
      category: cases.category,
      geography: cases.geography,
      status: cases.status,
      submittedAt: cases.submitted_at,
      createdAt: cases.created_at,
      updatedAt: cases.updated_at,
      ...campaignSummaryColumns(),
    })
    .from(cases)
    .where(
      and(eq(cases.created_by, viewer.userId), eq(cases.organization_id, viewer.organizationId)),
    )
    .orderBy(desc(cases.updated_at))
    .all();
}

/** Projection row type inferred from the query — NOT hand-rolled (drizzle owns the shape). */
type CampaignRow = Awaited<ReturnType<typeof selectClientCampaignRows>>[number];

function toCampaignSummary(r: CampaignRow): ClientCampaignSummary {
  const action = parseAction(r.latestAction);
  const latest =
    action !== null && r.latestActionAtMs !== null
      ? { action, actedAtMs: r.latestActionAtMs }
      : null;
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    geography: r.geography,
    status: toClientStatus(
      r.status,
      action,
      r.submittedAt !== null,
      isClientResponded(latest, r.submittedAt?.getTime() ?? null),
    ),
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  };
}

/** Lists the viewer's own campaigns with friendly status (created_by + org scoped). */
export async function listClientCampaigns(
  db: Db,
  viewer: ViewerContext,
): Promise<ClientCampaignSummary[]> {
  return (await selectClientCampaignRows(db, viewer)).map(toCampaignSummary);
}

/**
 * Builds the strict, client-safe detail for an already-ownership-verified
 * campaign. The organizer ask is surfaced only when the status is
 * needs_evidence; notes are visibility-scoped (client_facing only) by
 * `readCaseNotes`. The final `ClientCaseDetailSchema.parse` is the structural
 * whitelist that keeps brief internals from leaking.
 */
export async function buildClientCaseDetail(
  db: Db,
  viewer: ViewerContext,
  campaign: OwnedCampaign,
): Promise<ClientCaseDetail> {
  const latest = await latestReviewerAction(db, campaign.id);
  const status = ClientStatusEnum.parse(
    toClientStatus(
      campaign.status,
      latest?.action ?? null,
      campaign.submitted_at !== null,
      isClientResponded(latest, campaign.submitted_at?.getTime() ?? null),
    ),
  );
  const overlay = CaseOverlaySchema.safeParse(campaign.brief_partial_json);
  const overlayData = overlay.success ? overlay.data : null;
  const reviewHistory = await fetchReviewHistory(db, campaign.id, viewer.organizationId);
  const latestRequest = reviewHistory[0];
  const organizerAsk =
    status === "needs_evidence" && latestRequest
      ? { message: latestRequest.message, missingItems: latestRequest.missingItems }
      : null;
  const notes = await readCaseNotes(db, viewer, campaign.id);
  return ClientCaseDetailSchema.parse({
    id: campaign.id,
    status,
    title: campaign.title,
    category: campaign.category,
    geography: campaign.geography,
    claimedZakatCategory: campaign.claimed_zakat_category,
    story: overlayData?.story ?? "",
    organizerName: overlayData?.organizer_name ?? "",
    vouchingNarrative: overlayData?.vouching_narrative ?? null,
    createdAt: campaign.created_at.getTime(),
    updatedAt: campaign.updated_at.getTime(),
    evidence: buildEvidenceList(await currentExtractedKeys(db, campaign.id, viewer.organizationId)),
    organizerAsk,
    canResubmit: await canResubmit(db, viewer.organizationId, campaign.id, latest),
    reviewHistory,
    notes,
  });
}
