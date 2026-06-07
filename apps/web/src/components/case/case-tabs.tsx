/**
 * Tabbed case-detail shell. The header stays always-visible above this; here we
 * split the body into Overview / Brief / Signals / Documents / Messages. The
 * active tab lives in the URL (`?tab=`); when absent it falls back to a
 * status-derived default so a SUSPENDED_HITL case opens straight to the action.
 *
 * The Brief panel is `forceMount`ed and merely hidden when inactive — the SSE
 * brief stream + its one-shot `useStreamOpener` ref must NOT unmount on a tab
 * switch, or returning to the tab re-POSTs `/brief` and 409s. Every other tab
 * mounts on first activation, so Signals/Messages fetch lazily.
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CaseTabEnum,
  HITL_SUSPENDED_STATUS,
  type CaseDetailResponse,
  type CaseOverlay,
  type CaseRow,
  type CaseStatus,
  type CaseTab,
} from "@mizan/shared";
import { COPY } from "@/lib/copy-constants.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { BriefStream } from "@/components/brief/stream.tsx";
import { ActionPanel } from "@/components/case/action-panel.tsx";
import { BriefEmptyState } from "./brief-empty.tsx";
import { BriefHistoryView } from "./brief-history.tsx";
import { BriefInflight } from "./brief-inflight.tsx";
import { DocumentsPanel } from "./documents-panel.tsx";
import { SignalExpansionPanel } from "./signal-expansion-panel.tsx";
import { StoryPanel } from "./story-panel.tsx";
import { ReviewerNotesPanel } from "./notes-panel.tsx";

export type BriefSummary = CaseDetailResponse["brief"];
export type BriefPanelMode = "stream" | "inflight" | "action" | "summary" | "empty";

interface BriefPanelProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
  readonly mode: BriefPanelMode;
  readonly canRerun: boolean;
  readonly onGenerate: () => void;
  readonly onStreamError: () => void;
}

/** Mode-switched brief surface (stream / inflight / action / summary / empty). */
export function BriefPanel({
  caseRow,
  brief,
  overlay,
  mode,
  canRerun,
  onGenerate,
  onStreamError,
}: BriefPanelProps): React.JSX.Element {
  if (mode === "stream") return <BriefStream caseId={caseRow.id} onStreamError={onStreamError} />;
  if (mode === "inflight") return <BriefInflight status={caseRow.status} />;
  if (mode === "action") return <ActionPanel detail={{ case: caseRow, brief, overlay }} />;
  if (mode === "summary" && brief) {
    return (
      <BriefHistoryView
        caseId={caseRow.id}
        latestBrief={brief}
        canRerun={canRerun}
        onGenerate={onGenerate}
      />
    );
  }
  return <BriefEmptyState status={caseRow.status} onGenerate={onGenerate} />;
}

function deriveDefaultTab(status: CaseStatus, brief: BriefSummary): CaseTab {
  if (status === HITL_SUSPENDED_STATUS) return "brief";
  if (brief) return "brief";
  return "overview";
}

interface CaseTabsProps {
  readonly caseRow: CaseRow;
  readonly brief: BriefSummary;
  readonly overlay: CaseOverlay | null;
  readonly mode: BriefPanelMode;
  readonly canRerun: boolean;
  readonly onGenerate: () => void;
  readonly onStreamError: () => void;
}

/** Tab strip; the Brief trigger carries a pulsing dot while an action is owed. */
function CaseTabStrip({ isHitl }: { readonly isHitl: boolean }): React.JSX.Element {
  return (
    <TabsList>
      <TabsTrigger value="overview">{COPY.caseTabs.overview}</TabsTrigger>
      <TabsTrigger value="brief">
        {COPY.caseTabs.brief}
        {isHitl ? (
          <span
            aria-hidden
            className="pulse-dot ml-0.5 inline-block size-1.5 rounded-full bg-status-warning-foreground text-status-warning-foreground"
          />
        ) : null}
      </TabsTrigger>
      <TabsTrigger value="signals">{COPY.caseTabs.signals}</TabsTrigger>
      <TabsTrigger value="documents">{COPY.caseTabs.documents}</TabsTrigger>
      <TabsTrigger value="messages">{COPY.caseTabs.messages}</TabsTrigger>
    </TabsList>
  );
}

export function CaseTabs(props: CaseTabsProps): React.JSX.Element {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const effective = search.tab ?? deriveDefaultTab(props.caseRow.status, props.brief);
  const setTab = (next: string) =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, tab: CaseTabEnum.parse(next) }) });

  return (
    <Tabs value={effective} onValueChange={setTab} className="space-y-6">
      <CaseTabStrip isHitl={props.caseRow.status === HITL_SUSPENDED_STATUS} />

      <TabsContent value="overview" className="animate-section space-y-6 pt-2">
        <StoryPanel overlay={props.overlay} />
      </TabsContent>

      <TabsContent value="brief" forceMount className="mt-0 pt-2 data-[state=inactive]:hidden">
        <BriefPanel
          caseRow={props.caseRow}
          brief={props.brief}
          overlay={props.overlay}
          mode={props.mode}
          canRerun={props.canRerun}
          onGenerate={props.onGenerate}
          onStreamError={props.onStreamError}
        />
      </TabsContent>

      <TabsContent value="signals" className="animate-section pt-2">
        <SignalExpansionPanel caseId={props.caseRow.id} />
      </TabsContent>

      <TabsContent value="documents" className="animate-section pt-2">
        <DocumentsPanel caseId={props.caseRow.id} hasOverlay={props.overlay !== null} />
      </TabsContent>

      <TabsContent value="messages" className="animate-section pt-2">
        <ReviewerNotesPanel caseId={props.caseRow.id} />
      </TabsContent>
    </Tabs>
  );
}
