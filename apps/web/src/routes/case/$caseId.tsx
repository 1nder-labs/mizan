/**
 * `/case/$caseId` route config. Prefetches case + brief and guards with
 * `requireReviewer` (a client session is bounced to its portal). Page
 * component lives in `@/components/case/page.tsx`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CaseTabEnum } from "@mizan/shared";
import { requireReviewer } from "@/lib/auth-client.ts";
import { caseDetailQueryOptions } from "@/lib/cases-api.ts";
import { CaseDetailPage } from "@/components/case/page.tsx";

/**
 * `tab` is optional with `.catch(undefined)` (NOT a default) so the page can
 * fall back to a STATUS-derived tab when the URL omits it. Do NOT add
 * `loaderDeps: ({ search }) => search` — the tab is render-only and must never
 * re-run the loader fetch on a tab switch.
 */
const CaseSearchSchema = z.object({ tab: CaseTabEnum.optional().catch(undefined) });

export const Route = createFileRoute("/case/$caseId")({
  validateSearch: CaseSearchSchema.parse,
  beforeLoad: ({ context }) => requireReviewer(context.queryClient),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(caseDetailQueryOptions(params.caseId)),
  component: CaseDetailPage,
});
