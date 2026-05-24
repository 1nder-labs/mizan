/**
 * `/admin/audit` route config. Guards with `requireAdmin` which redirects
 * reviewers to `/queue` and unauthenticated users to `/login`. Page
 * component lives in `@/components/admin/page.tsx`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/auth-client.ts";
import { AdminAuditPage } from "@/components/admin/page.tsx";

export const Route = createFileRoute("/admin/audit")({
  beforeLoad: ({ context }) => requireAdmin(context.queryClient),
  component: AdminAuditPage,
});
