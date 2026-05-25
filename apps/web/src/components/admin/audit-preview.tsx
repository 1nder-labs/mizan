/**
 * Audit-log preview card — empty skeleton table holding the visual
 * shape for the audit surface. Stable row keys so React doesn't trip
 * on index-as-key.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

const PREVIEW_SLOTS = ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"] as const;

export function AuditTablePreview(): React.JSX.Element {
  return (
    <Card className="border-border/80 shadow-elev-1">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {PREVIEW_SLOTS.map((slot) => (
          <div key={slot} className="grid grid-cols-[8rem_1fr_6rem] items-center gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
