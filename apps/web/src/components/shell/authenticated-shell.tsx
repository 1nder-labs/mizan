/**
 * Authenticated page wrapper — `<main>` + AppHeader + sign-out wiring.
 *
 * Every authenticated route (queue, case detail, admin audit) needs the
 * same outer chrome: full-height background, top app-bar with nav, and
 * a sign-out hook bound to the session cache. Triplicating the wrapper
 * across page components was the original shape and made adding a new
 * authenticated surface a copy-paste; this shell removes that.
 *
 * Pages render their own page body as `children`; they no longer own
 * the sign-out hook or the header.
 */
import { useSignOut } from "@/hooks/use-sign-out.ts";
import { AppHeader } from "@/components/shell/app-header.tsx";

interface AuthenticatedShellProps {
  readonly context: string;
  readonly children: React.ReactNode;
}

export function AuthenticatedShell({
  context,
  children,
}: AuthenticatedShellProps): React.JSX.Element {
  const { signOut, signingOut } = useSignOut();
  return (
    <main className="min-h-screen bg-background">
      <AppHeader context={context} onSignOut={signOut} signingOut={signingOut} />
      {children}
    </main>
  );
}
