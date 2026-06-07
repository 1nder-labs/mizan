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
  type ReviewerAction,
  type ViewerContext,
} from "@mizan/shared";
import { clientResponded, latestReviewerAction, readCaseNotes } from "./case-notes.ts";

type OwnedCampaign = typeof cases.$inferSelect;

function parseAction(raw: string | null): ReviewerAction | null {
  if (raw === null) return null;
  const parsed = ReviewerActionEnum.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The latest brief's drafted organizer ask, when one has been composed. */
async function fetchOrganizerAsk(db: Db, caseId: string, organizationId: string) {
  const row = await db
    .select({ payload: briefs.payload_json })
    .from(briefs)
    .where(and(eq(briefs.case_id, caseId), eq(briefs.organization_id, organizationId)))
    .orderBy(desc(briefs.composed_at))
    .limit(1)
    .get();
  if (!row) return null;
  const parsed = BriefPayloadSchema.safeParse(row.payload);
  const ask = parsed.success ? parsed.data.drafted_organizer_message : undefined;
  return ask ? { message: ask.message, missingItems: ask.missing_items } : null;
}

/** Per-slot upload state from the current document versions (non-empty key = uploaded). */
function buildEvidenceList(keys: ExtractedDocumentKeys) {
  return DocumentKeyEnum.options.map((docKind) => ({
    docKind,
    uploaded: keys[docKind].length > 0,
  }));
}

/** Lists the viewer's own campaigns with friendly status (created_by + org scoped). */
export async function listClientCampaigns(
  db: Db,
  viewer: ViewerContext,
): Promise<ClientCampaignSummary[]> {
  const rows = await db
    .select({
      id: cases.id,
      title: cases.title,
      category: cases.category,
      geography: cases.geography,
      status: cases.status,
      submittedAt: cases.submitted_at,
      createdAt: cases.created_at,
      updatedAt: cases.updated_at,
      latestAction: sql<
        string | null
      >`(SELECT ${reviewer_actions.action} FROM ${reviewer_actions} WHERE ${reviewer_actions.case_id} = ${cases.id} ORDER BY ${reviewer_actions.acted_at} DESC LIMIT 1)`,
    })
    .from(cases)
    .where(
      and(eq(cases.created_by, viewer.userId), eq(cases.organization_id, viewer.organizationId)),
    )
    .orderBy(desc(cases.updated_at))
    .all();
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      geography: r.geography,
      status: toClientStatus(
        r.status,
        parseAction(r.latestAction),
        r.submittedAt !== null,
        await clientResponded(db, r.id),
      ),
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
    })),
  );
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
  const status = ClientStatusEnum.parse(
    toClientStatus(
      campaign.status,
      (await latestReviewerAction(db, campaign.id))?.action ?? null,
      campaign.submitted_at !== null,
      await clientResponded(db, campaign.id),
    ),
  );
  const overlay = CaseOverlaySchema.safeParse(campaign.brief_partial_json);
  const overlayData = overlay.success ? overlay.data : null;
  const organizerAsk =
    status === "needs_evidence"
      ? await fetchOrganizerAsk(db, campaign.id, viewer.organizationId)
      : null;
  const notes = await readCaseNotes(db, viewer, campaign.id);
  return ClientCaseDetailSchema.parse({
    id: campaign.id,
    status,
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
    notes,
  });
}
