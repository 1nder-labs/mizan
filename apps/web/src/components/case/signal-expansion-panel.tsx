/**
 * Trust-signal expansion panel — one accordion-like row per persisted
 * `signal_type`. Each row surfaces a structured signal body so the
 * reviewer sees WHY the AI scored the way it did, not just the
 * collapsed `confidence` integer on the brief.
 *
 * Placeholder rows render for known signal types that haven't been
 * persisted yet (`registry_lookup`, `sanctions_screen`, `ocr_mismatch`
 * — Phase 8/9 will populate). All visible strings come from `COPY`.
 */
import { useState } from "react";
import { ChevronRight, Loader2, ShieldQuestion } from "lucide-react";
import type { CaseSignalEntry, CaseSignalsResponse, SignalType } from "@mizan/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useCaseSignals } from "@/hooks/use-case-signals.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";
import { PhotoDupBody } from "./signal-bodies/photo-dup-body.tsx";
import { StoryCoherenceBody } from "./signal-bodies/story-coherence-body.tsx";
import { VouchingChainBody } from "./signal-bodies/vouching-chain-body.tsx";

interface SignalExpansionPanelProps {
  readonly caseId: string;
}

const SIGNAL_ROWS: readonly { signal_type: SignalType; label: string }[] = [
  { signal_type: "photo_dup", label: COPY.signals.photoDupLabel },
  { signal_type: "story_coherence", label: COPY.signals.storyCoherenceLabel },
  { signal_type: "vouching_chain", label: COPY.signals.vouchingChainLabel },
  { signal_type: "registry_lookup", label: COPY.signals.registryLookupLabel },
  { signal_type: "sanctions_screen", label: COPY.signals.sanctionsScreenLabel },
  { signal_type: "ocr_mismatch", label: COPY.signals.ocrMismatchLabel },
];

function findEntry(
  signals: CaseSignalsResponse["signals"],
  signalType: SignalType,
): CaseSignalEntry | undefined {
  return signals.find((entry) => entry.signal_type === signalType);
}

function SignalBody({
  entry,
  caseId,
}: {
  readonly entry: CaseSignalEntry;
  readonly caseId: string;
}): React.JSX.Element {
  if (entry.signal_type === "photo_dup") {
    return <PhotoDupBody caseId={caseId} payload={entry.payload_json} />;
  }
  if (entry.signal_type === "story_coherence") {
    return <StoryCoherenceBody payload={entry.payload_json} />;
  }
  if (entry.signal_type === "vouching_chain") {
    return <VouchingChainBody payload={entry.payload_json} />;
  }
  return (
    <pre className="overflow-x-auto rounded-md border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
      {JSON.stringify(entry.payload_json, null, 2)}
    </pre>
  );
}

function SignalRowHeader({
  label,
  entry,
  open,
}: {
  readonly label: string;
  readonly entry: CaseSignalEntry | undefined;
  readonly open: boolean;
}): React.JSX.Element {
  const hasEntry = entry !== undefined;
  return (
    <>
      <span className="flex items-center gap-2">
        <ShieldQuestion
          className={cn("size-4", hasEntry ? "text-foreground" : "text-muted-foreground/40")}
        />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </span>
      <span className="flex items-center gap-3">
        <span
          className={cn(
            "text-[11px] uppercase tracking-wider",
            hasEntry ? "text-muted-foreground" : "text-muted-foreground/70",
          )}
        >
          {hasEntry ? new Date(entry.recorded_at).toLocaleDateString() : COPY.signals.notYetRun}
        </span>
        {hasEntry ? (
          <ChevronRight
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open ? "rotate-90" : "rotate-0",
            )}
          />
        ) : null}
      </span>
    </>
  );
}

function SignalRow({
  label,
  entry,
  caseId,
}: {
  readonly label: string;
  readonly entry: CaseSignalEntry | undefined;
  readonly caseId: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const hasEntry = entry !== undefined;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card/70 transition-all duration-200",
        hasEntry ? "border-border/60" : "border-border/30 opacity-70",
        open && "border-foreground/30 shadow-elev-1",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed hover:bg-muted/30 disabled:hover:bg-transparent"
        onClick={() => setOpen((current) => !current)}
        disabled={!hasEntry}
        aria-expanded={open}
      >
        <SignalRowHeader label={label} entry={entry} open={open} />
      </button>
      {open && entry ? (
        <div className="animate-rise border-t border-border/40 bg-muted/10 p-4">
          <SignalBody entry={entry} caseId={caseId} />
        </div>
      ) : null}
    </div>
  );
}

export function SignalExpansionPanel({ caseId }: SignalExpansionPanelProps): React.JSX.Element {
  const query = useCaseSignals(caseId);
  const entries = query.data?.signals ?? [];
  return (
    <Card className="border-border/80 shadow-elev-1">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{COPY.signals.panelTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isPending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {COPY.documents.loadingLabel}
          </div>
        ) : null}
        {SIGNAL_ROWS.map((row) => (
          <SignalRow
            key={row.signal_type}
            label={row.label}
            entry={findEntry(entries, row.signal_type)}
            caseId={caseId}
          />
        ))}
      </CardContent>
    </Card>
  );
}
