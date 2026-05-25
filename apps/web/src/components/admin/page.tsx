/**
 * Admin audit page. Renders the admin-only audit log surface. Shell +
 * header + sign-out wiring live in `<AuthenticatedShell>`.
 */
import { History, Lock } from "lucide-react";
import { AuditTablePreview } from "@/components/admin/audit-preview.tsx";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";

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
            Every reviewer action and workflow transition will surface here.
          </p>
        </div>
        <Alert>
          <AlertTitle>No audit entries yet.</AlertTitle>
          <AlertDescription>
            Once reviewer actions and workflow transitions land, they appear in this table.
          </AlertDescription>
        </Alert>
        <AuditTablePreview />
      </section>
    </AuthenticatedShell>
  );
}
