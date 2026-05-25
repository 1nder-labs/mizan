import { Button } from "@/components/ui/button.tsx";

export function QueueEmptyState({
  onClearFilters,
}: {
  readonly onClearFilters: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-sm text-muted-foreground">
      <span>No cases match these filters.</span>
      <Button variant="ghost" size="sm" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}
