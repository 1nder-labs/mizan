/**
 * Single-source status badge for the case row. Maps every value of
 * `cases.status` to the design-system status palette declared in
 * `globals.css`. RUNNING carries the pulse-dot affordance so the
 * queue table reads the live state at a glance without animation
 * noise across the rest of the row.
 */
import type { CaseStatus } from "@mizan/shared";
import { cn } from "@/lib/utils.ts";

const STATUS_LABEL: Record<CaseStatus, string> = {
  DRAFT: "Draft",
  QUEUED: "Queued",
  RUNNING: "Running",
  SUSPENDED_HITL: "Awaiting reviewer",
  READY_FOR_REVIEW: "Ready",
  ACTIONED: "Actioned",
  FAILED: "Failed",
};

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
  READY_FOR_REVIEW: {
    container: "bg-status-success text-status-success-foreground border-status-success-border",
    dot: "bg-status-success-foreground",
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
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none tracking-wide whitespace-nowrap",
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
      {STATUS_LABEL[status]}
    </span>
  );
}
