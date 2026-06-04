/**
 * Single source of truth for every user-visible string introduced by
 * Phase 7.5. Inline string literals in JSX are forbidden — components
 * consume strings from `COPY` so a copy change is one diff in one file
 * and so the implementer of one unit can't accidentally invent a
 * different label for the same concept than the implementer of another.
 *
 * Existing surfaces (Phase 4–7) keep their own copy locally for now;
 * a future pass may consolidate but is out of Phase 7.5's scope.
 */
import type { CaseStatus, ClientStatus, DocumentKey } from "@mizan/shared";

export const COPY = {
  error: {
    title: "Something went wrong",
    body: "We hit an unexpected error loading this page. Try again, or head back to the start.",
    retry: "Try again",
    home: "Back to start",
    notFound: "We couldn't find that page.",
  },
  /**
   * Server error code -> user-facing message. The single source consumed by
   * `errorMessage()` in `api-errors.ts`; every API failure resolves through here
   * so the same code shows the same message everywhere. `fallback` covers any
   * code without an explicit entry.
   */
  apiError: {
    campaign_not_found: "We couldn't find that campaign.",
    case_no_longer_draft: "This campaign is under review and can no longer be edited.",
    case_decided: "This campaign has been decided and can no longer be changed.",
    invalid_evidence: "That file couldn't be accepted — use a PDF or image under 25 MB.",
    unauthorized: "Your session has expired. Please sign in again.",
    forbidden: "You don't have access to that.",
    no_active_org_membership: "Your account isn't set up for this workspace yet.",
    not_found: "We couldn't find what you were looking for.",
    no_run: "This case has no active run to action.",
    not_suspended_or_claimed: "Another reviewer is already actioning this case.",
    workflow_failed: "The action couldn't be completed. Please try again.",
    duplicate_email: "That email already has an account.",
    invitation_not_found: "That invitation no longer exists.",
    invitation_expired: "That invitation has expired.",
    internal_error: "Something went wrong on our end. Please try again.",
    unknown: "Something went wrong. Please try again.",
    fallback: "Something went wrong. Please try again.",
  },
  documents: {
    panelTitle: "Documents",
    panelEmpty: "Not available yet — case still in draft",
    creatorIdLabel: "Creator ID",
    bankStatementLabel: "Bank statement",
    categoryDocLabel: "Category document",
    openInTab: "Open in new tab",
    downloadLabel: "Download",
    loadingLabel: "Loading document…",
    loadError: "Couldn't load this document. Try refreshing the page.",
    pdfNextPage: "Next page",
    pdfPrevPage: "Previous page",
    pdfPageOf: (current: number, total: number) => `Page ${current} of ${total}`,
    pdfZoomIn: "Zoom in",
    pdfZoomOut: "Zoom out",
  },
  story: {
    panelTitle: "Campaign story",
    organizerLabel: "Organizer",
    storyLabel: "Story on file",
    vouchingLabel: "Vouching narrative",
    readMore: "Read full narrative",
    readLess: "Show less",
    panelEmpty: "Story not yet extracted — case still in draft",
  },
  signals: {
    panelTitle: "Trust signals",
    loadingLabel: "Loading signals…",
    notYetRun: "Signal not yet run",
    photoDupLabel: "Photo originality",
    storyCoherenceLabel: "Story coherence",
    vouchingChainLabel: "Vouching chain",
    registryLookupLabel: "Registry lookup",
    sanctionsScreenLabel: "Sanctions screen",
    ocrMismatchLabel: "OCR mismatch",
    scoreLabel: "Score",
    evidenceLabel: "Evidence",
    expandLabel: "Expand",
  },
  citations: {
    drawerTitle: "Policy clause",
    drawerSourceLabel: "Source",
    drawerVersionLabel: "Corpus version",
    drawerNotFound: "Citation not found in corpus",
    drawerCopyClauseId: "Copy clause ID",
    sourceZakat: "Zakat policy",
    sourceSafety: "Safety policy",
    listEmpty: "No policy clauses cited in this brief",
  },
  queue: {
    boardTitle: "Pipeline",
    viewBoardLabel: "Board",
    viewTableLabel: "Table",
    readOnlyColumnTooltip: "This status is managed automatically by the workflow",
    transitionDenied: (from: string, to: string) =>
      `Can't move from ${from.replace(/_/g, " ").toLowerCase()} to ${to
        .replace(/_/g, " ")
        .toLowerCase()}`,
    moveSuccess: (status: string) => `Case moved to ${status.replace(/_/g, " ").toLowerCase()}`,
    moveError: "Couldn't update the case. Please try again.",
    columnEmpty: "No cases",
    closedGroupLabel: "Closed",
  },
  modal: {
    title: "Action this case",
    description: "Pick the disposition and capture an audit rationale.",
    submitButton: "Submit decision",
    cancelButton: "Cancel",
    rationaleLabel: "Rationale",
    rationalePlaceholder: "Optional notes for the audit trail",
    rationaleRequired: "Rationale is required for Override and Block actions.",
    actionApprove: "Approve",
    actionRequestDocs: "Request docs",
    actionEscalate: "Escalate",
    actionBlock: "Block",
    actionOverride: "Override",
  },
  realtime: {
    assignedToast: "New case assigned to you",
    unassignedToast: "A case was unassigned from you",
  },
  chat: {
    panelTitle: "Mizan Copilot",
    panelClose: "Close copilot",
    shortcutHint: "⌘⇧K",
    threadsHeading: "Conversations",
    toggleThreads: "Toggle conversations",
    newChat: "New chat",
    resizeLabel: "Resize copilot panel",
    backToQueue: "Back to queue",
    composerPlaceholder: "Ask about this case, its signals, or the policy…",
    sendLabel: "Send",
    stopLabel: "Stop",
    stoppedMarker: "(stopped)",
    newConversation: "New conversation",
    emptyTitle: "Understand the campaign in front of you",
    emptyDescription:
      "Mizan Copilot reads the case, brief, signals, and policy you already have access to — and surfaces evidence. It never decides for you.",
    listEmpty: "No cases match this filter.",
    policySearchEmpty: "No policy clauses matched.",
    listTruncated: "Showing the first page of matches. Narrow the filter to see fewer.",
    toolQueued: (toolName: string) => `Queued: ${toolName}`,
    toolError: "Tool call failed",
    retryLabel: "Retry",
    schemaDrift: "This conversation uses an older message format and cannot be loaded.",
  },
  org: {
    switcherLabel: "Active organization",
    switchPrompt: "Switch workspace",
  },
  theme: {
    label: "Theme",
    system: "System theme",
    light: "Light theme",
    dark: "Dark theme",
  },
  invite: {
    linkCopied: "Invite link copied",
    clipboardBlockedTitle: "Clipboard blocked",
    clipboardBlockedBody:
      "Your browser blocked the clipboard. We can show the URL on screen instead — make sure only you can see it.",
    revealUrlConfirm: "Show URL",
    copyManuallyHint: "Copy manually from the field below.",
  },
  reviewerNotes: {
    panelTitle: "Client communications",
    clientThreadTab: "Client thread",
    internalTab: "Internal notes",
    fromClient: "Client",
    fromReviewer: "Reviewer",
    messagePlaceholder: "Write a message to the client…",
    internalPlaceholder: "Add an internal note (not visible to client)…",
    sendMessage: "Send message",
    addInternal: "Add note",
    composeError: "Could not send. Please try again.",
    notesEmpty: "No notes yet.",
    respondedBadge: "Client responded",
    clientSubmittedBadge: "Client submitted",
    clientSubmittedShort: "Client",
    loadError: "Couldn't load notes. Try refreshing.",
  },
  portal: {
    brand: "Mizan",
    signupTitle: "Create your campaign account",
    signupSubtitle: "Submit your fundraising campaign for review.",
    signupName: "Full name",
    signupEmail: "Email",
    signupPassword: "Password",
    signupSubmit: "Create account",
    signupPending: "Creating account…",
    signupError: "Could not create your account. Please try again.",
    signupHaveAccount: "Already have an account?",
    signupLogin: "Sign in",
    listTitle: "My campaigns",
    listSubtitle: "Track each campaign through review.",
    listEmptyTitle: "No campaigns yet",
    listEmptyBody: "Start a campaign to submit it for review.",
    listNew: "Start a campaign",
    listColumnCampaign: "Campaign",
    listColumnStatus: "Status",
    listColumnUpdated: "Updated",
    listLoadError: "Could not load your campaigns.",
    signOut: "Sign out",
    intakeTitle: "Start a campaign",
    intakeSubtitle: "Tell us about your campaign. You can add documents next.",
    intakeSectionAbout: "About the campaign",
    intakeSectionClassify: "Classification",
    intakeSectionCommunity: "Community",
    intakeStory: "Campaign story",
    intakeStoryPlaceholder: "Describe what you are raising funds for…",
    intakeStoryHelp: "A few sentences on who this helps and why now.",
    intakeOrganizer: "Organizer name",
    intakeOrganizerPlaceholder: "Person or charity running this campaign",
    intakeOrganizerHelp: "Whoever is accountable for the funds raised.",
    intakeCategory: "Category",
    intakeCategoryPlaceholder: "Select a category",
    intakeCategoryHelp: "The kind of relief this campaign provides.",
    intakeGeography: "Country",
    intakeGeographyHelp: "Where the funds will be spent.",
    intakeZakat: "Zakat category",
    intakeZakatPlaceholder: "Select if Zakat-eligible",
    intakeZakatNone: "Not Zakat-specific",
    intakeZakatHelp: "Which of the eight Zakat-eligible categories applies, if any.",
    intakeVouching: "Community vouching",
    intakeVouchingPlaceholder: "Anyone local who can vouch for this campaign…",
    intakeVouchingHelp: "Optional. A local reference strengthens the review.",
    intakeDocsTitle: "Documents come next",
    intakeDocsBody:
      "After you create the campaign, you'll upload the three required documents — organizer ID, bank statement, and a category document — on its page.",
    countryPlaceholder: "Select a country",
    countrySearch: "Search countries…",
    countryEmpty: "No country found.",
    intakeSubmit: "Create campaign",
    intakePending: "Saving…",
    intakeCancel: "Cancel",
    intakeError: "Could not save your campaign. Check the fields and try again.",
    detailBack: "Back to my campaigns",
    detailLoadError: "Could not load this campaign.",
    detailEvidenceTitle: "Documents",
    detailEvidenceSubtitle: "Upload the three documents the reviewer needs.",
    detailNotesTitle: "Messages",
    detailNotesEmpty: "No messages yet.",
    detailAskTitle: "The reviewer needs more from you",
    evidenceUploaded: "Uploaded",
    evidenceMissing: "Not uploaded",
    evidenceUpload: "Upload",
    evidenceReplace: "Replace",
    evidencePending: "Uploading…",
    evidenceHint: "PDF or image, up to 25 MB.",
    evidenceDecided: "This campaign has been decided — documents can no longer be changed.",
    evidenceError: "Upload failed. Use a PDF or image under 25 MB.",
    noteFromYou: "You",
    noteFromReviewer: "Reviewer",
    editButton: "Edit details",
    editTitle: "Edit campaign",
    editSubmit: "Save changes",
    editConflict: "This campaign is under review and can no longer be edited.",
    draftBannerTitle: "This campaign is a draft",
    draftBannerBody: "Finish the details, add your documents, then submit it for review.",
    draftSubmit: "Submit for review",
    draftSubmitting: "Submitting…",
    draftSubmitError: "Could not submit your campaign. Please try again.",
    draftDelete: "Delete draft",
    draftDeleting: "Deleting…",
    draftDeleteConfirm: "Delete this draft? This can't be undone.",
    draftDeleteError: "Could not delete this draft. Please try again.",
  },
} as const;

const STATUS_DISPLAY: Readonly<Record<CaseStatus, string>> = {
  DRAFT: "Drafts",
  QUEUED: "Queued",
  RUNNING: "In progress",
  SUSPENDED_HITL: "Awaiting reviewer",
  READY_FOR_REVIEW: "Ready for review",
  ACTIONED: "Actioned",
  FAILED: "Failed",
};

/** Returns the stakeholder-facing display label for a CaseStatus. */
export function statusDisplay(status: CaseStatus): string {
  return STATUS_DISPLAY[status];
}

const CLIENT_STATUS_DISPLAY: Readonly<Record<ClientStatus, string>> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  needs_evidence: "Needs more evidence",
  approved: "Approved",
  under_further_review: "Under further review",
  not_approved: "Not approved",
};

/** Returns the friendly, client-facing label for a ClientStatus. */
export function clientStatusDisplay(status: ClientStatus): string {
  return CLIENT_STATUS_DISPLAY[status];
}

const DOC_KIND_DISPLAY: Readonly<Record<DocumentKey, string>> = {
  creator_id: "Creator ID",
  bank_statement: "Bank statement",
  category_doc: "Category document",
};

/** Returns the client-facing label for one of the three core evidence docs. */
export function docKindDisplay(docKind: DocumentKey): string {
  return DOC_KIND_DISPLAY[docKind];
}
