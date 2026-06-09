/**
 * Loading skeleton for the case-detail route. Extracted so the route
 * file exports only `Route` and the page component (fast-refresh clean).
 */
import { Skeleton } from "@/components/ui/skeleton.tsx";

export function CaseDetailSkeleton(): React.JSX.Element {
  return (
    <div className="w-full space-y-8 px-6 py-8">
      <div className="space-y-4 border-b border-border/50 pb-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-96 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
