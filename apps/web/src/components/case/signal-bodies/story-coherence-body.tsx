/**
 * `story_coherence` signal body — named-entity density, template-match score,
 * and a coherence prose summary. Score bars use saturated semantic status
 * fills (foreground tokens) so the reviewer can scan WHY at a glance, and each
 * jargon label carries an InfoHint explaining what the metric means.
 */
import type { StoryCoherencePayload } from "@mizan/shared";
import { InfoHint } from "@/components/ui/info-hint.tsx";

const NAMED_ENTITY_HINT =
  "How much of the story is concrete, checkable detail — specific names, places, and organizations. Higher means more verifiable specifics; very low can read as a vague or generic appeal.";

const TEMPLATE_MATCH_HINT =
  "How closely the wording matches known boilerplate / scam fundraising templates. Lower is better — a high score means the text looks copy-pasted from a template.";

/** Maps a clamped 0–1 value to a saturated semantic status fill class. */
function pickTone(value: number, invert: boolean | undefined): string {
  const clamped = Math.min(1, Math.max(0, value));
  if (invert) {
    if (clamped < 0.4) return "bg-status-success-foreground";
    if (clamped < 0.7) return "bg-status-warning-foreground";
    return "bg-status-destructive-foreground";
  }
  if (clamped < 0.4) return "bg-status-destructive-foreground";
  if (clamped < 0.7) return "bg-status-warning-foreground";
  return "bg-status-success-foreground";
}

function ScoreBar({
  label,
  hint,
  value,
  invert,
}: {
  readonly label: string;
  readonly hint: string;
  readonly value: number;
  readonly invert?: boolean;
}): React.JSX.Element {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1">
          {label}
          <InfoHint label={hint} />
        </span>
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

export function StoryCoherenceBody({
  payload,
}: {
  readonly payload: StoryCoherencePayload;
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <ScoreBar
          label="Named-entity density"
          hint={NAMED_ENTITY_HINT}
          value={payload.named_entity_density}
        />
        <ScoreBar
          label="Template match (lower better)"
          hint={TEMPLATE_MATCH_HINT}
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
