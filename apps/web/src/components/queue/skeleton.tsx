import { Skeleton } from "@/components/ui/skeleton.tsx";

export function QueueSkeleton(): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elev-1">
      <div className="grid grid-cols-6 gap-4 border-b border-border bg-muted/30 px-6 py-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="grid grid-cols-6 items-center gap-4 px-6 py-3.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
