/**
 * Compile-time contract snapshot for the Hono RPC tree consumed by
 * `apps/web`. `Equal<A, B>` checks that both sides are structurally
 * identical — not just one being a subtype of the other — so any
 * worker route drift in EITHER direction (added or removed field) causes
 * a compile error before runtime tests catch it.
 *
 * No runtime assertions; the test body guards against the snapshot being
 * tree-shaken out of the typecheck graph.
 */
import { describe, expect, test } from "bun:test";
import { hc } from "hono/client";
import type { InferResponseType } from "hono/client";
import type { AppType } from "@mizan/shared/app-type";
import type {
  AuditListResponse,
  BriefHistoryResponse,
  CampaignMutationResponse,
  CaseDetailResponse,
  CaseNotesResponse,
  CaseSignalsResponse,
  ChatThreadListResponse,
  ClientCampaignsResponse,
  ClientCaseDetail,
  DocumentUrlResponse,
  MeResponse,
  PolicyClauseResponse,
  QueueResponse,
  ReviewerActionResponse,
} from "@mizan/shared";

/** Structural identity check: true only when A and B are exactly the same type. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const client = hc<AppType>("/api");

type WireQueueList = InferResponseType<typeof client.cases.$get>;
type WireCaseDetail = InferResponseType<(typeof client.cases)[":id"]["$get"]>;
type WireBriefHistory = InferResponseType<(typeof client.cases)[":id"]["briefs"]["$get"]>;
type WireReviewerAction = InferResponseType<(typeof client.cases)[":id"]["action"]["$post"]>;
type WireAuditList = InferResponseType<typeof client.admin.audit.$get>;
type WireDocumentUrl = InferResponseType<
  (typeof client.cases)[":id"]["documents"][":docKey"]["url"]["$get"]
>;
type WirePolicyClause = InferResponseType<(typeof client.policy.clauses)[":id"]["$get"]>;
type WireCaseSignals = InferResponseType<(typeof client.cases)[":id"]["signals"]["$get"]>;
type WireMe = InferResponseType<typeof client.me.$get>;
type WireChatThreads = InferResponseType<(typeof client.chat)["threads"]["$get"]>;
type WirePortalCampaigns = InferResponseType<typeof client.portal.campaigns.$get>;
type WirePortalCampaignDetail = InferResponseType<(typeof client.portal.campaigns)[":id"]["$get"]>;
type WirePortalCampaignCreate = InferResponseType<typeof client.portal.campaigns.$post>;
type WirePortalNotes = InferResponseType<(typeof client.portal.campaigns)[":id"]["notes"]["$get"]>;
type WireReviewerNotes = InferResponseType<(typeof client.cases)[":id"]["notes"]["$get"]>;

/**
 * Asserts that the wire queue-list response carries EXACTLY
 * `{ cases, page, pageSize, total }` — no more, no fewer fields.
 */
const _queueListExact: Equal<WireQueueList, QueueResponse> = true;

/**
 * Asserts that the wire case-detail response carries EXACTLY
 * `{ case, brief }` — no more, no fewer fields.
 */
const _caseDetailExact: Equal<WireCaseDetail, CaseDetailResponse> = true;

/**
 * Asserts the wire brief-history response (`GET /api/cases/:id/briefs`) matches
 * `BriefHistoryResponse` exactly — `{ briefs: BriefHistoryEntry[] }`.
 */
const _briefHistoryExact: Equal<WireBriefHistory, BriefHistoryResponse> = true;

/**
 * Asserts that the wire reviewer-action response matches the shared schema.
 */
const _reviewerActionExact: Equal<WireReviewerAction, ReviewerActionResponse> = true;

/**
 * Asserts that the wire audit-list response matches AuditListResponse exactly.
 */
const _auditListExact: Equal<WireAuditList, AuditListResponse> = true;

/**
 * Phase 7.5: wire response for `GET /api/cases/:id/documents/:docKey/url`
 * must match `DocumentUrlResponse` exactly. `Equal<>` includes 200
 * shape only — 4xx error envelopes union into the response type and
 * are validated by `DocumentUrlErrorBodySchema` at the call site.
 */
const _documentUrlExact: Equal<WireDocumentUrl, DocumentUrlResponse> = true;

/**
 * Phase 7.5: wire response for `GET /api/policy/clauses/:id?source=...`
 * must match `PolicyClauseResponse` exactly.
 */
const _policyClauseExact: Equal<WirePolicyClause, PolicyClauseResponse> = true;

/**
 * Phase 7.5: wire response for `GET /api/cases/:id/signals` must match
 * `CaseSignalsResponse` exactly.
 */
const _caseSignalsExact: Equal<WireCaseSignals, CaseSignalsResponse> = true;

const _meExact: Equal<WireMe, MeResponse> = true;

const _chatThreadsExact: Equal<WireChatThreads, ChatThreadListResponse> = true;

/** Client portal (U8): list, strict detail, create, and the per-campaign note thread. */
const _portalCampaignsExact: Equal<WirePortalCampaigns, ClientCampaignsResponse> = true;
const _portalCampaignDetailExact: Equal<WirePortalCampaignDetail, ClientCaseDetail> = true;
const _portalCampaignCreateExact: Equal<WirePortalCampaignCreate, CampaignMutationResponse> = true;
const _portalNotesExact: Equal<WirePortalNotes, CaseNotesResponse> = true;

/** Reviewer-side note thread (U6): same wire shape as the portal thread. */
const _reviewerNotesExact: Equal<WireReviewerNotes, CaseNotesResponse> = true;

describe("AppType contract snapshot", () => {
  test("queue-list wire type matches QueueResponse exactly", () => {
    expect(_queueListExact).toBe(true);
  });

  test("case-detail wire type matches CaseDetailResponse exactly", () => {
    expect(_caseDetailExact).toBe(true);
  });

  test("brief-history wire type matches BriefHistoryResponse exactly", () => {
    expect(_briefHistoryExact).toBe(true);
  });

  test("reviewer-action wire type matches ReviewerActionResponse exactly", () => {
    expect(_reviewerActionExact).toBe(true);
  });

  test("audit-list wire type matches AuditListResponse exactly", () => {
    expect(_auditListExact).toBe(true);
  });

  test("document-url wire type matches DocumentUrlResponse exactly", () => {
    expect(_documentUrlExact).toBe(true);
  });

  test("policy-clause wire type matches PolicyClauseResponse exactly", () => {
    expect(_policyClauseExact).toBe(true);
  });

  test("case-signals wire type matches CaseSignalsResponse exactly", () => {
    expect(_caseSignalsExact).toBe(true);
  });

  test("me wire type matches MeResponse exactly", () => {
    expect(_meExact).toBe(true);
  });

  test("chat thread list wire type matches ChatThreadListResponse exactly", () => {
    expect(_chatThreadsExact).toBe(true);
  });

  test("portal campaigns list wire type matches ClientCampaignsResponse exactly", () => {
    expect(_portalCampaignsExact).toBe(true);
  });

  test("portal campaign detail wire type matches ClientCaseDetail exactly", () => {
    expect(_portalCampaignDetailExact).toBe(true);
  });

  test("portal campaign create wire type matches CampaignMutationResponse exactly", () => {
    expect(_portalCampaignCreateExact).toBe(true);
  });

  test("portal notes wire type matches CaseNotesResponse exactly", () => {
    expect(_portalNotesExact).toBe(true);
  });

  test("reviewer notes wire type matches CaseNotesResponse exactly", () => {
    expect(_reviewerNotesExact).toBe(true);
  });
});
