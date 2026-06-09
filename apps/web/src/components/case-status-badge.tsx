/**
 * Single-source status badge for the case row. Wraps shadcn `<Badge>`
 * so the chip primitive contract stays consistent across the app;
 * status palette colours come from our design-system tokens in
 * `globals.css` (mapped 1:1 to `cases.status` enum). The inner
 * dot stays as a `<span>` because it's a non-text affordance —
 * shadcn `<Badge>` only owns the outer pill shell.
 */
import type { CaseStatus } from "@mizan/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { CASE_STATUS_LABEL } from "@/lib/display-labels.ts";
import { cn } from "@/lib/utils.ts";

const STATUS_VARIANT: Record<
  CaseStatus,
  {
    readonly container: string;
    readonly dot: string;
    readonly pulse?: boolean;
  }
> = {
  DRAFT: {
    container: "bg-status-neutral text-status-neutral-foreground border-status-neutral-border",
    dot: "bg-status-neutral-foreground/60",
  },
  QUEUED: {
    container: "bg-status-info text-status-info-foreground border-status-info-border",
    dot: "bg-status-info-foreground/80",
  },
  RUNNING: {
    container: "bg-status-info text-status-info-foreground border-status-info-border",
    dot: "bg-status-info-foreground",
    pulse: true,
  },
  SUSPENDED_HITL: {
    container: "bg-status-warning text-status-warning-foreground border-status-warning-border",
    dot: "bg-status-warning-foreground",
  },
  ACTIONED: {
    container:
      "bg-status-success-strong text-status-success-strong-foreground border-status-success-strong",
    dot: "bg-status-success-strong-foreground",
  },
  FAILED: {
    container:
      "bg-status-destructive text-status-destructive-foreground border-status-destructive-border",
    dot: "bg-status-destructive-foreground",
  },
};

export function CaseStatusBadge({
  status,
  className,
}: {
  readonly status: CaseStatus;
  readonly className?: string;
}): React.JSX.Element {
  const variant = STATUS_VARIANT[status];
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
      {CASE_STATUS_LABEL[status]}
    </Badge>
  );
}
