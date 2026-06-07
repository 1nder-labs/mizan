/**
 * Queue page footer — shows live refresh indicator.
 * Extracted from the route file for fast-refresh cleanliness.
 */
export function QueueFooter({ refetching }: { readonly refetching: boolean }): React.JSX.Element {
  return (
    <footer className="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground/70">
      <span className={refetching ? "text-foreground" : undefined}>
        {refetching ? "Refreshing…" : "Up to date"}
      </span>
    </footer>
  );
}
