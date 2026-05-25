/**
 * Case detail page. Subscribes to the prefetched `CaseDetailResponse`
 * cache entry. `onFinish` invalidation from `<BriefStream>` re-fetches
 * and the status badge flips without a manual refresh. Shell + header
 * + sign-out wiring live in `<AuthenticatedShell>`.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { caseDetailQueryOptions } from "@/lib/cases-api.ts";
import { CaseDetail } from "@/components/case/detail.tsx";
import { CaseDetailSkeleton } from "@/components/case/detail-skeleton.tsx";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";

const caseApi = getRouteApi("/case/$caseId");

export function CaseDetailPage(): React.JSX.Element {
  const { caseId } = caseApi.useParams();
  const { data, error, isPending } = useQuery(caseDetailQueryOptions(caseId));

  if (isPending) {
    return (
      <AuthenticatedShell context="Case detail">
        <CaseDetailSkeleton />
      </AuthenticatedShell>
    );
  }
  if (error || !data) {
    return (
      <AuthenticatedShell context="Case detail">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <Alert variant="destructive">
            <AlertTitle>Case not available</AlertTitle>
            <AlertDescription>
              We couldn't load this case. It may have been removed, or your session expired.
            </AlertDescription>
          </Alert>
        </div>
      </AuthenticatedShell>
    );
  }
  return (
    <AuthenticatedShell context="Case detail">
      <CaseDetail caseRow={data.case} brief={data.brief} />
    </AuthenticatedShell>
  );
}
