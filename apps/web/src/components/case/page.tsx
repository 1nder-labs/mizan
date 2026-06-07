/**
 * Case detail page. Subscribes to the prefetched `CaseDetailResponse`
 * cache entry. `onFinish` invalidation from `<BriefStream>` re-fetches
 * and the status badge flips without a manual refresh. Shell + header
 * + sign-out wiring live in `<AuthenticatedShell>`.
 *
 * Error UI differentiates by failure mode: 401 already redirected via
 * the QueryCache.onError pipeline, so anything that reaches this
 * component is either ForbiddenError (lacks role), a `not_found`
 * payload, or an opaque transport / 5xx failure.
 */
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { caseDetailQueryOptions, ForbiddenError } from "@/lib/cases-api.ts";
import { CaseDetail } from "@/components/case/detail.tsx";
import { CaseDetailSkeleton } from "@/components/case/detail-skeleton.tsx";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";

const caseApi = getRouteApi("/case/$caseId");

interface ErrorCopy {
  readonly title: string;
  readonly body: string;
}

function classifyError(error: Error | null, missing: boolean): ErrorCopy {
  if (error instanceof ForbiddenError) {
    return {
      title: "You can't view this case",
      body: "Your account doesn't have permission to view this case. Ask an admin if you think this is wrong.",
    };
  }
  if (missing) {
    return {
      title: "Case not found",
      body: "We couldn't find this case. It may have been removed, or the link is wrong.",
    };
  }
  return {
    title: "Couldn't load case",
    body: "Something went wrong loading this case. Try again in a moment.",
  };
}

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
    const copy = classifyError(error ?? null, !error && !data);
    return (
      <AuthenticatedShell context="Case detail">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <Alert variant="destructive" className="rounded-xl shadow-elev-1">
            <AlertTitle className="font-semibold">{copy.title}</AlertTitle>
            <AlertDescription className="text-sm">{copy.body}</AlertDescription>
          </Alert>
        </div>
      </AuthenticatedShell>
    );
  }
  return (
    <AuthenticatedShell context="Case detail">
      <CaseDetail
        caseRow={data.case}
        brief={data.brief}
        overlay={data.overlay}
        clientResponded={data.client_responded}
        latestAction={data.latest_action}
      />
    </AuthenticatedShell>
  );
}
