import { ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

export function QueueEmptyState({
  onClearFilters,
}: {
  readonly onClearFilters: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card/40 px-6 py-20">
      <ScanSearch className="size-8 text-muted-foreground/40" />
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-sm font-medium text-muted-foreground">
          No cases match these filters.
        </span>
        <span className="text-xs text-muted-foreground/60">
          Adjust your filters to see results.
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}
