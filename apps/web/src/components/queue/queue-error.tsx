/**
 * Queue error notice — shown when the cases list query fails. Wires
 * an explicit retry button against the React Query refetch handler
 * passed by the route so the user can recover without a full page
 * reload.
 */
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

interface QueueErrorProps {
  readonly onRetry: () => void;
  readonly retrying: boolean;
}

export function QueueError({ onRetry, retrying }: QueueErrorProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-status-destructive-border bg-status-destructive p-4 text-sm text-status-destructive-foreground">
      <span>Failed to load cases.</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRetry}
        disabled={retrying}
        className="border-status-destructive-border bg-transparent text-status-destructive-foreground hover:bg-status-destructive/50"
      >
        <RotateCcw className="mr-2 size-3.5" />
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
