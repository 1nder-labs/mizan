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
import type { CaseStatus } from "@mizan/shared";

export const COPY = {
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
