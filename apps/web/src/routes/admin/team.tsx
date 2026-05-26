/**
 * `/admin/team` — Phase 7.6 admin team management surface.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/auth-client.ts";
import { AdminTeamPage } from "@/components/admin/team-page.tsx";

export const Route = createFileRoute("/admin/team")({
  beforeLoad: ({ context }) => requireAdmin(context.queryClient),
  component: AdminTeamPage,
});
