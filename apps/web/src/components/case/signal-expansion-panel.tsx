/**
 * Trust-signal expansion panel — one accordion-like row per persisted
 * `signal_type`. Each row surfaces a structured signal body so the
 * reviewer sees WHY the AI scored the way it did, not just the
 * collapsed `confidence` integer on the brief.
 *
 * Shows the four signals the workflow actually persists (`photo_dup`,
 * `story_coherence`, `vouching_chain`, `ocr_mismatch`). The reserved
 * `registry_lookup` + `sanctions_screen` DB enum values have no producer and
 * are intentionally not rendered. All visible strings come from `COPY`.
 */
import { useState } from "react";
import { ChevronRight, LoaderCircle, ShieldQuestion } from "lucide-react";
import type { CaseSignalEntry, CaseSignalsResponse, SignalType } from "@mizan/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useCaseSignals } from "@/hooks/use-case-signals.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";
import { OcrMismatchBody } from "./signal-bodies/ocr-mismatch-body.tsx";
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
  { signal_type: "ocr_mismatch", label: COPY.signals.ocrMismatchLabel },
];

function findEntry(
  signals: CaseSignalsResponse["signals"],
  signalType: SignalType,
): CaseSignalEntry | undefined {
  return signals.find((entry) => entry.signal_type === signalType);
}

/**
 * Raw payload dump for the opaque (registry / sanctions) signals that carry no
 * dedicated body. These arms exist only to keep the `SignalBody` switch
 * exhaustive over the discriminated union — `SIGNAL_ROWS` lists only the four
 * produced signals, so the panel never actually mounts a row for them. If a
 * producer is added for these types, add them to `SIGNAL_ROWS` and this body
 * becomes the (intentional) reachable fallback.
 */
function RawSignalBody({ payload }: { readonly payload: unknown }): React.JSX.Element {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

/**
 * Compile-time exhaustiveness guard: with every `signal_type` handled, the switch
 * default narrows `entry` to `never`, so adding a new signal type makes this call
 * error instead of silently falling through. Throws at runtime — unreachable.
 */
function assertNeverSignal(entry: never): never {
  throw new Error(`unhandled signal entry: ${JSON.stringify(entry)}`);
}

function SignalBody({
  entry,
  caseId,
}: {
  readonly entry: CaseSignalEntry;
  readonly caseId: string;
}): React.JSX.Element {
  switch (entry.signal_type) {
    case "photo_dup":
      return <PhotoDupBody caseId={caseId} payload={entry.payload_json} />;
    case "story_coherence":
      return <StoryCoherenceBody payload={entry.payload_json} />;
    case "vouching_chain":
      return <VouchingChainBody payload={entry.payload_json} />;
    case "ocr_mismatch":
      return <OcrMismatchBody payload={entry.payload_json} />;
    case "registry_lookup":
    case "sanctions_screen":
      return <RawSignalBody payload={entry.payload_json} />;
    default:
      return assertNeverSignal(entry);
  }
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
            "text-[11px] uppercase tracking-wider tabular",
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
        "relative overflow-hidden rounded-xl border bg-card/70 transition-all duration-200",
        hasEntry ? "border-border/60" : "border-border/30 opacity-70",
        open &&
          "border-foreground/20 shadow-elev-1 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-foreground",
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
        <CardTitle className="text-base font-semibold tracking-[-0.01em]">
          {COPY.signals.panelTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isPending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            {COPY.signals.loadingLabel}
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
