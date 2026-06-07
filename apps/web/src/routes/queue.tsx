/**
 * `/queue` route config. Validates search params, prefetches cases, and
 * guards with `requireReviewer` (a client session is bounced to its portal).
 * Page component lives in `@/components/queue/page.tsx`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { QueueSearchSchema } from "@mizan/shared";
import { requireReviewer } from "@/lib/auth-client.ts";
import { casesListQueryOptions } from "@/lib/cases-api.ts";
import { QueuePage } from "@/components/queue/page.tsx";

export const Route = createFileRoute("/queue")({
  validateSearch: QueueSearchSchema.parse,
  loaderDeps: ({ search }) => search,
  beforeLoad: ({ context }) => requireReviewer(context.queryClient),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(casesListQueryOptions(deps)),
  component: QueuePage,
});
