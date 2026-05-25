/**
 * Admin audit page. Renders the admin-only audit log surface.
 */
import { History, Lock } from "lucide-react";
import { AuditList } from "@/components/admin/audit-list.tsx";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell.tsx";

export function AdminAuditPage(): React.JSX.Element {
  return (
    <AuthenticatedShell context="Admin / audit">
      <section className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Lock className="size-3" />
            Admin only
          </div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            <History className="size-5 text-muted-foreground" />
            Audit log
          </h1>
          <p className="text-sm text-muted-foreground">
            Reviewer actions across all cases, newest first.
          </p>
        </div>
        <AuditList />
      </section>
    </AuthenticatedShell>
  );
}
