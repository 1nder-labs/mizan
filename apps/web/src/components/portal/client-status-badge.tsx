/**
 * Status badge for the client portal. Maps each `ClientStatus` onto the
 * same design-token palette used by `CaseStatusBadge` so the visual language
 * is consistent; labels come from `clientStatusDisplay` in copy-constants.
 */
import type { ClientStatus } from "@mizan/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { clientStatusDisplay } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";

const STATUS_VARIANT: Record<ClientStatus, { readonly container: string; readonly dot: string }> = {
  submitted: {
    container: "bg-status-neutral text-status-neutral-foreground border-status-neutral-border",
    dot: "bg-status-neutral-foreground/60",
  },
  under_review: {
    container: "bg-status-info text-status-info-foreground border-status-info-border",
    dot: "bg-status-info-foreground/80",
  },
  needs_evidence: {
    container: "bg-status-warning text-status-warning-foreground border-status-warning-border",
    dot: "bg-status-warning-foreground",
  },
  approved: {
    container:
      "bg-status-success-strong text-status-success-strong-foreground border-status-success-strong",
    dot: "bg-status-success-strong-foreground",
  },
  under_further_review: {
    container: "bg-status-info text-status-info-foreground border-status-info-border",
    dot: "bg-status-info-foreground/80",
  },
  not_approved: {
    container:
      "bg-status-destructive text-status-destructive-foreground border-status-destructive-border",
    dot: "bg-status-destructive-foreground",
  },
};

export function ClientStatusBadge({
  status,
  className,
}: {
  readonly status: ClientStatus;
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
        className={cn("relative inline-block size-1.5 rounded-full", variant.dot)}
        aria-hidden
      />
      {clientStatusDisplay(status)}
    </Badge>
  );
}
