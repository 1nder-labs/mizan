/**
 * Admin audit page. Renders the admin-only audit log surface.
 */
import { FileClock, Lock } from "lucide-react";
import { AuditList } from "@/components/admin/audit-list.tsx";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell.tsx";

export function AdminAuditPage(): React.JSX.Element {
  return (
    <AuthenticatedShell context="Admin / audit">
      <section className="w-full space-y-8 px-6 py-10">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <Lock className="size-3" />
            Admin only
          </div>
          <h1 className="text-display flex items-center gap-3 text-3xl font-semibold tracking-tight">
            <FileClock className="size-5 text-muted-foreground" />
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
