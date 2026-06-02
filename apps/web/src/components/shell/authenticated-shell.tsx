/**
 * Authenticated page wrapper — delegates to `<SidebarShell>` (Phase 7.6).
 * Pages render their body as `children`; shell owns nav + signout.
 */
import { SidebarShell } from "@/components/shell/sidebar-shell.tsx";

interface AuthenticatedShellProps {
  readonly context: string;
  readonly children: React.ReactNode;
}

export function AuthenticatedShell({
  context,
  children,
}: AuthenticatedShellProps): React.JSX.Element {
  return <SidebarShell context={context}>{children}</SidebarShell>;
}
