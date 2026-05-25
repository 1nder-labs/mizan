/**
 * `/queue` route config. Validates search params, prefetches cases, and
 * guards with `requireSession`. Page component lives in
 * `@/components/queue/page.tsx`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { QueueSearchSchema } from "@mizan/shared";
import { requireSession } from "@/lib/auth-client.ts";
import { casesListQueryOptions } from "@/lib/cases-api.ts";
import { QueuePage } from "@/components/queue/page.tsx";

export const Route = createFileRoute("/queue")({
  validateSearch: QueueSearchSchema.parse,
  loaderDeps: ({ search }) => search,
  beforeLoad: ({ context }) => requireSession(context.queryClient),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(casesListQueryOptions(deps)),
  component: QueuePage,
});
