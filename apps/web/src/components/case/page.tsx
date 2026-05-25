/**
 * Case detail page component. Subscribes to the prefetched
 * `CaseDetailResponse` cache entry. `onFinish` invalidation from
 * `<BriefStream>` re-fetches and the status badge flips without a
 * manual refresh. Renders the shared app header so the case detail
 * surface carries the same Queue / Audit / Sign-out nav as every
 * other authenticated page.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useSignOut } from "@/hooks/use-sign-out.ts";
import { caseDetailQueryOptions } from "@/lib/cases-api.ts";
import { CaseDetail } from "@/components/case/detail.tsx";
import { CaseDetailSkeleton } from "@/components/case/detail-skeleton.tsx";
import { QueueHeader } from "@/components/queue/header.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";

const caseApi = getRouteApi("/case/$caseId");

export function CaseDetailPage(): React.JSX.Element {
  const { caseId } = caseApi.useParams();
  const { data, error, isPending } = useQuery(caseDetailQueryOptions(caseId));
  const { signOut, signingOut } = useSignOut();

  if (isPending) {
    return (
      <main className="min-h-screen bg-background">
        <QueueHeader context="Case detail" onSignOut={signOut} signingOut={signingOut} />
        <CaseDetailSkeleton />
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="min-h-screen bg-background">
        <QueueHeader context="Case detail" onSignOut={signOut} signingOut={signingOut} />
        <div className="mx-auto max-w-3xl px-6 py-16">
          <Alert variant="destructive">
            <AlertTitle>Case not available</AlertTitle>
            <AlertDescription>
              We couldn't load this case. It may have been removed, or your session expired.
            </AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-background">
      <QueueHeader context="Case detail" onSignOut={signOut} signingOut={signingOut} />
      <CaseDetail caseRow={data.case} brief={data.brief} />
    </main>
  );
}
