/**
 * In-flight banner. Sits above the live stream view (or replaces it
 * when nothing has streamed yet) and tells the reviewer another
 * session owns the workflow run for this case.
 */
import { LoaderCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";

interface InFlightNoticeProps {
  readonly onRefresh: () => void;
  readonly refreshing: boolean;
}

export function InFlightNotice({ onRefresh, refreshing }: InFlightNoticeProps): React.JSX.Element {
  return (
    <Card className="border-border/60 shadow-elev-1">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin text-foreground" />
          <CardTitle className="text-sm font-semibold tracking-tight">Composing brief</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:cursor-wait"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Another session is already running the workflow for this case. The brief will appear here
          automatically when it finishes.
        </p>
      </CardContent>
    </Card>
  );
}
