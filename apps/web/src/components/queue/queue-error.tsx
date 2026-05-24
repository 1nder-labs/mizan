/**
 * Queue error notice — shown when the cases list query fails.
 * Extracted from the route file for fast-refresh cleanliness.
 */
export function QueueError(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-status-destructive-border bg-status-destructive p-4 text-sm text-status-destructive-foreground">
      Failed to load cases. Retry from the table actions.
    </div>
  );
}
