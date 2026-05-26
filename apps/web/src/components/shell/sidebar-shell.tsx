/**
 * Phase 7.6 — fixed-left sidebar shell that replaces the top app bar.
 * Stakeholder-grade chrome: org pill at the top, nav stack in the
 * middle, user pill + signout at the bottom. Collapses to a top
 * sheet drawer on narrow viewports (handled by CSS, no JS toggle).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { History, ListChecks, LogOut, ShieldCheck, Users2 } from "lucide-react";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { sessionQueryOptions } from "@/lib/auth-client.ts";
import { useSignOut } from "@/hooks/use-sign-out.ts";
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
  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-foreground/5 data-[active=true]:text-foreground";

interface SidebarShellProps {
  readonly context: string;
  readonly children: React.ReactNode;
}

function OrgPill(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 shadow-elev-1">
      <div className="grid size-8 place-items-center rounded-md bg-foreground text-background">
        <ShieldCheck className="size-4" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight">Mizan</p>
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">T&amp;S team</p>
      </div>
    </div>
  );
}

function SignOutBlock({
  user,
}: {
  readonly user: { name?: string; email?: string; role?: string } | null;
}): React.JSX.Element {
  const { signOut, signingOut } = useSignOut();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/50 p-2.5 text-left transition-colors hover:bg-card"
          disabled={signingOut}
        >
          <div className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
            {user?.email?.slice(0, 2) ?? "U"}
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-foreground">
              {user?.name ?? user?.email ?? "Member"}
            </p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {user?.role ?? "reviewer"}
            </p>
          </div>
          <LogOut className="size-4 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign out of Mizan?</DialogTitle>
          <DialogDescription>
            Your active session will end and you'll return to the login screen.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={signingOut}>
            Cancel
          </Button>
          <Button type="button" onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NavLinks({ isAdmin }: { readonly isAdmin: boolean }): React.JSX.Element {
  return (
    <nav className="flex flex-col gap-1">
      <Link
        to="/queue"
        search={DEFAULT_QUEUE_SEARCH}
        className={NAV_LINK}
        activeOptions={{ exact: false, includeSearch: false }}
        activeProps={{ "data-active": "true" }}
      >
        <ListChecks className="size-4" />
        Queue
      </Link>
      {isAdmin ? (
        <Link
          to="/admin/audit"
          className={NAV_LINK}
          activeOptions={{ exact: false }}
          activeProps={{ "data-active": "true" }}
        >
          <History className="size-4" />
          Audit
        </Link>
      ) : null}
      {isAdmin ? (
        <Link
          to="/admin/team"
          className={NAV_LINK}
          activeOptions={{ exact: false }}
          activeProps={{ "data-active": "true" }}
        >
          <Users2 className="size-4" />
          Team
        </Link>
      ) : null}
    </nav>
  );
}

export function SidebarShell({ context, children }: SidebarShellProps): React.JSX.Element {
  const { data: session } = useQuery(sessionQueryOptions());
  const isAdmin = session?.user.role === "admin";
  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-border bg-card/40 p-4 backdrop-blur md:flex",
        )}
      >
        <OrgPill />
        <div className="flex-1 space-y-4">
          <p className="px-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
            {context}
          </p>
          <NavLinks isAdmin={isAdmin} />
        </div>
        <SignOutBlock user={session?.user ?? null} />
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-2 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          <span className="text-sm font-semibold tracking-tight">Mizan</span>
          <span className="text-xs text-muted-foreground">· {context}</span>
        </div>
      </header>
      <main className="md:pl-64">{children}</main>
    </div>
  );
}
