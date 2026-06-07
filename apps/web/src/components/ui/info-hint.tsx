import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * A small inline info icon that reveals a clarifying tooltip on hover/focus.
 * Additive only — it never replaces visible copy, it explains it. Carries its
 * own `TooltipProvider` so it works anywhere (including isolated component
 * tests) without depending on an ancestor provider.
 */
export function InfoHint({
  label,
  className,
}: {
  readonly label: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
