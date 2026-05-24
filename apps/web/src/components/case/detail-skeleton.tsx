/**
 * Loading skeleton for the case-detail route. Extracted so the route
 * file exports only `Route` and the page component (fast-refresh clean).
 */
import { Skeleton } from "@/components/ui/skeleton.tsx";

export function CaseDetailSkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
