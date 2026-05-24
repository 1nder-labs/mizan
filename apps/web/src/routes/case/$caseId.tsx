/**
 * `/case/$caseId` route config. Prefetches case + brief and guards with
 * `requireSession`. Page component lives in `@/components/case/page.tsx`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/lib/auth-client.ts";
import { caseDetailQueryOptions } from "@/lib/cases-api.ts";
import { CaseDetailPage } from "@/components/case/page.tsx";

export const Route = createFileRoute("/case/$caseId")({
  beforeLoad: ({ context }) => requireSession(context.queryClient),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(caseDetailQueryOptions(params.caseId)),
  component: CaseDetailPage,
});
