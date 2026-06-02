import { and, desc, eq, sql } from "drizzle-orm";
import { briefs, cases, reviewer_actions, type Db } from "@mizan/db";
import {
  BriefPayloadSchema,
  CaseOverlaySchema,
  ClientCaseDetailSchema,
  ClientStatusEnum,
  DocumentKeyEnum,
  ReviewerActionEnum,
  toClientStatus,
  type CaseOverlay,
  type ClientCampaignSummary,
  type ClientCaseDetail,
  type ReviewerAction,
  type ViewerContext,
} from "@mizan/shared";
import { readCaseNotes } from "./case-notes.ts";

type OwnedCampaign = typeof cases.$inferSelect;

function parseAction(raw: string | null): ReviewerAction | null {
  if (raw === null) return null;
  const parsed = ReviewerActionEnum.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Latest reviewer action on a case, or null when none has been recorded. */
async function fetchLatestAction(db: Db, caseId: string): Promise<ReviewerAction | null> {
  const row = await db
    .select({ action: reviewer_actions.action })
    .from(reviewer_actions)
    .where(eq(reviewer_actions.case_id, caseId))
    .orderBy(desc(reviewer_actions.acted_at))
    .limit(1)
    .get();
  return row ? parseAction(row.action) : null;
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

/** Per-doc upload state derived from the overlay r2_keys (a non-empty key = uploaded). */
function buildEvidenceList(r2_keys: CaseOverlay["r2_keys"] | null) {
  return DocumentKeyEnum.options.map((docKind) => ({
    docKind,
    uploaded: (r2_keys?.[docKind] ?? "").length > 0,
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
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    geography: r.geography,
    status: toClientStatus(r.status, parseAction(r.latestAction)),
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  }));
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
    toClientStatus(campaign.status, await fetchLatestAction(db, campaign.id)),
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
    evidence: buildEvidenceList(overlayData?.r2_keys ?? null),
    organizerAsk,
    notes,
  });
}
