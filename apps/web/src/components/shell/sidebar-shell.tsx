/**
 * Sidebar shell — wraps the shadcn Sidebar primitive. Collapse state +
 * mobile sheet are owned by SidebarProvider via cookie persistence.
 * Nav links, org pill, and user pill plug into shadcn slots.
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";

interface SidebarShellProps {
  readonly context: string;
  readonly children: React.ReactNode;
}

interface NavItem {
  readonly to: "/queue" | "/admin/audit" | "/admin/team";
  readonly label: string;
  readonly icon: typeof ListChecks;
  readonly adminOnly: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: "/queue", label: "Queue", icon: ListChecks, adminOnly: false },
  { to: "/admin/audit", label: "Audit", icon: History, adminOnly: true },
  { to: "/admin/team", label: "Team", icon: Users2, adminOnly: true },
];

function OrgPill(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-foreground text-background">
        <ShieldCheck className="size-4" />
      </div>
      <div className="leading-tight group-data-[collapsible=icon]:hidden">
        <p className="text-sm font-semibold tracking-tight">Mizan</p>
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          T&amp;S team
        </p>
      </div>
    </div>
  );
}

function NavRow({ item }: { readonly item: NavItem }): React.JSX.Element {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.label}>
        {item.to === "/queue" ? (
          <Link
            to="/queue"
            search={DEFAULT_QUEUE_SEARCH}
            activeOptions={{ exact: false, includeSearch: false }}
            activeProps={{ "data-active": "true" }}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        ) : (
          <Link
            to={item.to}
            activeOptions={{ exact: false }}
            activeProps={{ "data-active": "true" }}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SignOutDialogBody({
  signOut,
  signingOut,
}: {
  readonly signOut: () => void;
  readonly signingOut: boolean;
}): React.JSX.Element {
  return (
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
  );
}

function UserPill({
  user,
}: {
  readonly user: { name?: string; email?: string; role?: string } | null;
}): React.JSX.Element {
  const { signOut, signingOut } = useSignOut();
  return (
    <Dialog>
      <SidebarMenuItem>
        <DialogTrigger asChild>
          <SidebarMenuButton size="lg" tooltip={user?.email ?? "Sign out"} disabled={signingOut}>
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
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
          </SidebarMenuButton>
        </DialogTrigger>
      </SidebarMenuItem>
      <SignOutDialogBody signOut={signOut} signingOut={signingOut} />
    </Dialog>
  );
}

function TopBar({ context }: { readonly context: string }): React.JSX.Element {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-2 backdrop-blur">
      <SidebarTrigger />
      <span className="text-sm font-semibold tracking-tight">{context}</span>
    </header>
  );
}

function NavGroup({ isAdmin }: { readonly isAdmin: boolean }): React.JSX.Element {
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigate</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <NavRow key={item.to} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function SidebarShell({ context, children }: SidebarShellProps): React.JSX.Element {
  const { data: session } = useQuery(sessionQueryOptions());
  const isAdmin = session?.user.role === "admin";
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <OrgPill />
        </SidebarHeader>
        <SidebarContent>
          <NavGroup isAdmin={Boolean(isAdmin)} />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <UserPill user={session?.user ?? null} />
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <TopBar context={context} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
