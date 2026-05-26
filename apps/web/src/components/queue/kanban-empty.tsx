import { COPY } from "@/lib/copy-constants.ts";

export function KanbanEmpty(): React.JSX.Element {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border/40 bg-background/50">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/50">
        {COPY.queue.columnEmpty}
      </span>
    </div>
  );
}
