/**
 * Case detail page component. Subscribes to the prefetched case + brief
 * cache entry. `onFinish` invalidation from `<BriefStream>` re-fetches
 * and the status badge flips without a manual refresh.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { caseDetailQueryOptions } from "@/lib/cases-api.ts";
import { CaseDetail } from "@/components/case/detail.tsx";
import { CaseDetailSkeleton } from "@/components/case/detail-skeleton.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";

const caseApi = getRouteApi("/case/$caseId");

export function CaseDetailPage(): React.JSX.Element {
  const { caseId } = caseApi.useParams();
  const { data, error, isPending } = useQuery(caseDetailQueryOptions(caseId));

  if (isPending) return <CaseDetailSkeleton />;
  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <Alert variant="destructive">
          <AlertTitle>Case not available</AlertTitle>
          <AlertDescription>
            We couldn't load this case. It may have been removed, or your session expired.
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-background">
      <CaseDetail
        caseRow={data.case}
        briefPayload={data.briefPayload}
        briefComposedAt={data.brief?.composed_at ?? null}
      />
    </main>
  );
}
