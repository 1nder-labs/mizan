/**
 * Lightweight shell for the client portal. Renders a top header with the
 * brand name and a sign-out button, then a centred main content area.
 * Does not use the reviewer `AuthenticatedShell` (sidebar + org switcher)
 * because clients have no sidebar navigation.
 */
import { Loader2 } from "lucide-react";
import { COPY } from "@/lib/copy-constants.ts";
import { useSignOut } from "@/hooks/use-sign-out.ts";
import { Button } from "@/components/ui/button.tsx";
import { NotificationBell } from "@/components/notifications/notification-bell.tsx";

interface PortalShellProps {
  readonly children: React.ReactNode;
}

export function PortalShell({ children }: PortalShellProps): React.JSX.Element {
  const { signOut, signingOut } = useSignOut();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/50 bg-card/80 px-6 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {COPY.portal.brand}
          </span>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
              {signingOut ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
              {COPY.portal.signOut}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
