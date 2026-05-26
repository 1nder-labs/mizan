/**
 * `/admin/audit` route config with loader prefetch.
 */
import { createFileRoute } from "@tanstack/react-router";
import { AuditListSearchSchema } from "@mizan/shared";
import { requireAdmin } from "@/lib/auth-client.ts";
import { auditListQueryOptions } from "@/lib/audit-api.ts";
import { AdminAuditPage } from "@/components/admin/page.tsx";

export const Route = createFileRoute("/admin/audit")({
  validateSearch: AuditListSearchSchema,
  beforeLoad: ({ context }) => requireAdmin(context.queryClient),
  loaderDeps: ({ search }) => ({ search }),
  /**
   * `prefetchQuery` (not `ensureQueryData`) — warms the cache but never
   * throws, so a transient 500 surfaces inside the audit panel via
   * `AuditList`'s `isError` branch + toast, not as a full-route
   * "Something went wrong!" boundary that nukes the whole page.
   */
  loader: ({ context, deps }) =>
    context.queryClient.prefetchQuery(auditListQueryOptions(deps.search)),
  component: AdminAuditPage,
});
