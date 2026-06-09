/**
 * Settled-brief surface with run history. The latest brief renders by default
 * (no loading flash — it comes from the case-detail query the parent already
 * holds); the full per-run history loads in the background and, once there is
 * more than one run, a version selector lets the reviewer revisit any earlier
 * brief. Re-run is offered only while viewing the latest; viewing an older run
 * swaps the re-run affordance for a "back to latest" banner so it's never
 * ambiguous which brief a re-run would supersede.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers, RotateCw } from "lucide-react";
import type { BriefHistoryEntry, BriefSummary } from "@mizan/shared";
import { caseBriefsQueryOptions } from "@/lib/cases-api.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { formatMediumDateTime } from "@/lib/format.ts";
import { BriefDetailTabs } from "./brief-details.tsx";
import { BriefSummaryCard } from "./brief-summary.tsx";

type NonNullBrief = NonNullable<BriefSummary>;

interface BriefHistoryViewProps {
  readonly caseId: string;
  readonly latestBrief: NonNullBrief;
  readonly canRerun: boolean;
  readonly onGenerate: () => void;
}

function versionLabel(entry: BriefHistoryEntry, index: number): string {
  const when = formatMediumDateTime(entry.composed_at);
  return index === 0 ? `Latest · ${when}` : when;
}

function VersionSelect({
  entries,
  value,
  onChange,
}: {
  readonly entries: readonly BriefHistoryEntry[];
  readonly value: string;
  readonly onChange: (next: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Layers className="size-3.5 text-muted-foreground" />
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {COPY.caseBrief.versionLabel}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-56 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entries.map((entry, index) => (
            <SelectItem key={entry.run_id} value={entry.run_id} className="text-xs">
              {versionLabel(entry, index)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RerunBar({ onGenerate }: { readonly onGenerate: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-2.5">
      <p className="text-xs text-muted-foreground">{COPY.caseBrief.rerunHint}</p>
      <Button size="sm" variant="outline" onClick={onGenerate}>
        <RotateCw className="mr-2 size-3.5" />
        {COPY.caseBrief.rerunAction}
      </Button>
    </div>
  );
}

function PreviousVersionBanner({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-info-border bg-status-info px-4 py-2.5 text-status-info-foreground">
      <p className="text-xs">{COPY.caseBrief.viewingPrevious}</p>
      <Button size="sm" variant="outline" onClick={onBack}>
        <ArrowLeft className="mr-2 size-3.5" />
        {COPY.caseBrief.backToLatest}
      </Button>
    </div>
  );
}

export function BriefHistoryView({
  caseId,
  latestBrief,
  canRerun,
  onGenerate,
}: BriefHistoryViewProps): React.JSX.Element {
  const { data } = useQuery(caseBriefsQueryOptions(caseId));
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const entries = data?.briefs ?? [];
  const latestRunId = entries[0]?.run_id ?? null;
  const selected = entries.find((entry) => entry.run_id === selectedRunId) ?? null;
  const viewingLatest = selectedRunId === null || selectedRunId === latestRunId;
  const payload = selected?.payload_json ?? latestBrief.payload_json;
  const composedAt = selected?.composed_at ?? latestBrief.composed_at;

  return (
    <div className="space-y-4">
      {entries.length > 1 ? (
        <VersionSelect
          entries={entries}
          value={selectedRunId ?? latestRunId ?? ""}
          onChange={setSelectedRunId}
        />
      ) : null}
      {viewingLatest ? (
        canRerun ? (
          <RerunBar onGenerate={onGenerate} />
        ) : null
      ) : (
        <PreviousVersionBanner onBack={() => setSelectedRunId(null)} />
      )}
      <BriefSummaryCard payload={payload} composedAt={composedAt} />
      <BriefDetailTabs payload={payload} />
    </div>
  );
}
