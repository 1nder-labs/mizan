/**
 * `story_coherence` signal body — named-entity density,
 * template-match score, coherence prose summary. Score bars use
 * semantic status tokens so the reviewer can scan WHY without reading
 * numbers; forensic monochrome chrome, color only for state.
 */
import type { StoryCoherencePayload } from "@mizan/shared";

interface StoryCoherenceBodyProps {
  readonly payload: StoryCoherencePayload;
}

/** Maps a clamped 0–1 value to a semantic status fill class. */
function pickTone(value: number, invert: boolean | undefined): string {
  const clamped = Math.min(1, Math.max(0, value));
  if (invert) {
    if (clamped < 0.4) return "bg-status-success";
    if (clamped < 0.7) return "bg-status-warning";
    return "bg-status-destructive";
  }
  if (clamped < 0.4) return "bg-status-destructive";
  if (clamped < 0.7) return "bg-status-warning";
  return "bg-status-success";
}

function ScoreBar({
  label,
  value,
  invert,
}: {
  readonly label: string;
  readonly value: number;
  readonly invert?: boolean;
}): React.JSX.Element {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="font-numeric text-foreground">{(clamped * 100).toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`${pickTone(clamped, invert)} h-full transition-all duration-500`}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
    </div>
  );
}

export function StoryCoherenceBody({ payload }: StoryCoherenceBodyProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <ScoreBar label="Named-entity density" value={payload.named_entity_density} />
        <ScoreBar
          label="Template match (lower better)"
          value={payload.template_match_score}
          invert
        />
      </div>
      <p className="whitespace-pre-wrap rounded-xl border border-border/40 bg-muted/20 p-4 text-[13px] leading-relaxed text-foreground/90">
        {payload.coherence_summary}
      </p>
    </div>
  );
}
