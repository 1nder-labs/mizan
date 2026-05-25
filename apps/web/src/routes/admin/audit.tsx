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
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(auditListQueryOptions(deps.search)),
  component: AdminAuditPage,
});
