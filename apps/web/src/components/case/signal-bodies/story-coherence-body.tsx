/**
 * `story_coherence` signal body — named-entity density,
 * template-match score, coherence prose summary. Score bars are
 * color-coded so the reviewer can scan WHY without reading numbers.
 */
import type { StoryCoherencePayload } from "@mizan/shared";

interface StoryCoherenceBodyProps {
  readonly payload: StoryCoherencePayload;
}

function pickTone(value: number, invert: boolean | undefined): string {
  const clamped = Math.min(1, Math.max(0, value));
  if (invert) {
    if (clamped < 0.4) return "bg-gradient-to-r from-emerald-400 to-emerald-500";
    if (clamped < 0.7) return "bg-gradient-to-r from-amber-400 to-amber-500";
    return "bg-gradient-to-r from-rose-400 to-rose-500";
  }
  if (clamped < 0.4) return "bg-gradient-to-r from-rose-400 to-rose-500";
  if (clamped < 0.7) return "bg-gradient-to-r from-amber-400 to-amber-500";
  return "bg-gradient-to-r from-emerald-400 to-emerald-500";
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
        <span className="font-mono text-foreground tabular">{(clamped * 100).toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/60 shadow-[inset_0_1px_2px_oklch(0_0_0/0.06)]">
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
      <p className="whitespace-pre-wrap rounded-lg border border-border/40 bg-background/60 p-4 text-[13px] leading-relaxed text-foreground/90">
        {payload.coherence_summary}
      </p>
    </div>
  );
}
