/**
 * Recommendation badge — wraps shadcn `<Badge>` with the centralised
 * `--rec-*` palette tokens from `globals.css`. Same primitive contract
 * as every other chip in the app (`CaseStatusBadge`, tool-state chip).
 */
import type { Recommendation } from "@mizan/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

const LABEL: Record<Recommendation, string> = {
  READY_FOR_REVIEW: "Ready",
  REQUEST_DOCS: "Request docs",
  ESCALATE: "Escalate",
  BLOCK: "Block",
};

const VARIANT: Record<Recommendation, string> = {
  READY_FOR_REVIEW: "bg-rec-ready text-rec-ready-foreground border-rec-ready-border",
  REQUEST_DOCS: "bg-rec-request text-rec-request-foreground border-rec-request-border",
  ESCALATE: "bg-rec-escalate text-rec-escalate-foreground border-rec-escalate-border",
  BLOCK: "bg-rec-block text-rec-block-foreground border-rec-block-border",
};

export function RecommendationBadge({
  recommendation,
  className,
}: {
  readonly recommendation: Recommendation;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider",
        VARIANT[recommendation],
        className,
      )}
    >
      {LABEL[recommendation]}
    </Badge>
  );
}
