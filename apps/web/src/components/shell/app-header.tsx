/**
 * Top app-bar shared by `/queue`, `/case/$caseId`, `/admin/audit`.
 * Renders the Mizan wordmark, the page-context label, an inline nav
 * (Queue link + admin-only Audit link), and the sign-out dialog.
 *
 * The nav surface here is the canonical entry point for every
 * authenticated page so reviewers + admins never have to type URLs.
 * Admin links read the cached session role (already populated by the
 * route's beforeLoad → requireSession chain) and only render for the
 * admin role.
 *
 * Belongs to the authenticated app shell, not the queue feature —
 * lives in `shell/` so the module path matches its ownership.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { History, ListChecks, LogOut } from "lucide-react";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { sessionQueryOptions } from "@/lib/auth-client.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";

const NAV_LINK =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground";

function QueueNavLink(): React.JSX.Element {
  return (
    <Link
      to="/queue"
      search={DEFAULT_QUEUE_SEARCH}
      className={NAV_LINK}
      activeOptions={{ exact: false, includeSearch: false }}
      activeProps={{ "data-active": "true" }}
    >
      <ListChecks className="size-3.5" />
      Queue
    </Link>
  );
}

function AuditNavLink(): React.JSX.Element {
  return (
    <Link
      to="/admin/audit"
      className={NAV_LINK}
      activeOptions={{ exact: false }}
      activeProps={{ "data-active": "true" }}
    >
      <History className="size-3.5" />
      Audit
    </Link>
  );
}

function SignOutDialog({
  onSignOut,
  signingOut,
}: {
  readonly onSignOut: () => void;
  readonly signingOut: boolean;
}): React.JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={signingOut}>
          <LogOut className="mr-2 size-3.5" />
          Sign out
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign out of Mizan?</DialogTitle>
          <DialogDescription>
            Your active session will end and you’ll return to the login screen.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={signingOut}>
            Cancel
          </Button>
          <Button type="button" onClick={onSignOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppHeader({
  context,
  onSignOut,
  signingOut,
}: {
  readonly context: string;
  readonly onSignOut: () => void;
  readonly signingOut: boolean;
}): React.JSX.Element {
  const { data: session } = useQuery(sessionQueryOptions());
  const isAdmin = session?.user.role === "admin";

  return (
    <header className="border-b border-border bg-card/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold tracking-tight">Mizan</span>
            <span className="text-xs text-muted-foreground">{context}</span>
          </div>
          <nav className={cn("flex items-center gap-1")}>
            <QueueNavLink />
            {isAdmin ? <AuditNavLink /> : null}
          </nav>
        </div>
        <SignOutDialog onSignOut={onSignOut} signingOut={signingOut} />
      </div>
    </header>
  );
}
