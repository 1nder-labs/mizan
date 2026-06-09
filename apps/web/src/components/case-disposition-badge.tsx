/**
 * Single human-readable disposition chip for the case-detail header. Replaces
 * the old trio (raw status + "client responded" + "client submitted") with the
 * one derived `CaseDisposition` — submitted/responded/terminal are all already
 * folded into the disposition upstream, so one badge carries the full truth.
 * Palette colours reuse the same `globals.css` status tokens as
 * `CaseStatusBadge`; only `AWAITING_REVIEWER` pulses, since it's the live HITL
 * gate the reviewer must act on.
 */
import { REVIEWER_DISPOSITION_LABEL, type CaseDisposition } from "@mizan/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

interface DispositionVariant {
  readonly container: string;
  readonly dot: string;
  readonly pulse?: boolean;
}

const NEUTRAL = "bg-status-neutral text-status-neutral-foreground border-status-neutral-border";
const INFO = "bg-status-info text-status-info-foreground border-status-info-border";
const WARNING = "bg-status-warning text-status-warning-foreground border-status-warning-border";
const SUCCESS = "bg-status-success text-status-success-foreground border-status-success-border";
const SUCCESS_STRONG =
  "bg-status-success-strong text-status-success-strong-foreground border-status-success-strong";
const DESTRUCTIVE =
  "bg-status-destructive text-status-destructive-foreground border-status-destructive-border";

const DISPOSITION_VARIANT: Record<CaseDisposition, DispositionVariant> = {
  DRAFT: { container: NEUTRAL, dot: "bg-status-neutral-foreground/60" },
  SUBMITTED: { container: INFO, dot: "bg-status-info-foreground/80" },
  IN_REVIEW: { container: INFO, dot: "bg-status-info-foreground" },
  AWAITING_REVIEWER: { container: WARNING, dot: "bg-status-warning-foreground", pulse: true },
  NEEDS_CLIENT_DOCS: { container: INFO, dot: "bg-status-info-foreground/80" },
  CLIENT_REPLIED: { container: WARNING, dot: "bg-status-warning-foreground" },
  ESCALATED: { container: WARNING, dot: "bg-status-warning-foreground" },
  APPROVED: { container: SUCCESS_STRONG, dot: "bg-status-success-strong-foreground" },
  DECLINED: { container: DESTRUCTIVE, dot: "bg-status-destructive-foreground" },
  REVIEWED: { container: SUCCESS, dot: "bg-status-success-foreground" },
  FAILED: { container: DESTRUCTIVE, dot: "bg-status-destructive-foreground" },
};

export function CaseDispositionBadge({
  disposition,
  className,
}: {
  readonly disposition: CaseDisposition;
  readonly className?: string;
}): React.JSX.Element {
  const variant = DISPOSITION_VARIANT[disposition];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tracking-wide",
        variant.container,
        className,
      )}
    >
      <span
        className={cn(
          "relative inline-block size-1.5 rounded-full",
          variant.dot,
          variant.pulse ? "pulse-dot" : null,
        )}
        aria-hidden
      />
      {REVIEWER_DISPOSITION_LABEL[disposition]}
    </Badge>
  );
}
