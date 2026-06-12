/**
 * Sidebar shell — wraps the shadcn Sidebar primitive. Collapse state +
 * mobile sheet are owned by SidebarProvider via cookie persistence. Brand
 * mark and nav links plug into shadcn slots; the footer is a single
 * consolidated account menu (theme switch + org switch + sign out live
 * inside the profile popover, not loose on the rail).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, FileClock, LogOut, Scale, SquareKanban, UsersRound } from "lucide-react";
import { loadQueueSearch } from "@/lib/queue-nav-memory.ts";
import { sessionQueryOptions } from "@/lib/auth-client.ts";
import { meQueryOptions } from "@/lib/me-api.ts";
import { useSignOut } from "@/hooks/use-sign-out.ts";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
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
import { ChatPanel } from "@/components/chat/chat-panel.tsx";
import { ActiveOrgSwitcher } from "@/components/org/active-org-switcher.tsx";
import { ThemeToggle } from "@/components/shell/theme-toggle.tsx";
import { NotificationBell } from "@/components/notifications/notification-bell.tsx";

interface SidebarShellProps {
  readonly context: string;
  readonly children: React.ReactNode;
}

interface NavItem {
  readonly to: "/queue" | "/admin/audit" | "/admin/team";
  readonly label: string;
  readonly icon: typeof SquareKanban;
  readonly adminOnly: boolean;
}

interface AccountUser {
  readonly name?: string;
  readonly email?: string;
  readonly role?: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: "/queue", label: "Queue", icon: SquareKanban, adminOnly: false },
  { to: "/admin/audit", label: "Audit", icon: FileClock, adminOnly: true },
  { to: "/admin/team", label: "Team", icon: UsersRound, adminOnly: true },
];

function BrandMark(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5 p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
      <div className="btn-primary-surface grid size-9 shrink-0 place-items-center rounded-lg group-data-[collapsible=icon]:size-8">
        <Scale className="size-[18px]" />
      </div>
      <div className="leading-tight group-data-[collapsible=icon]:hidden">
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-sidebar-foreground">
          Mizan
        </p>
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/45">
          Trust &amp; Safety
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
            search={loadQueueSearch()}
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

function AccountAvatar({ email }: { readonly email: string | undefined }): React.JSX.Element {
  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase text-foreground">
      {email?.slice(0, 2) ?? "U"}
    </div>
  );
}

function AccountMenuPanel({
  user,
  signOut,
  signingOut,
}: {
  readonly user: AccountUser | null;
  readonly signOut: () => void;
  readonly signingOut: boolean;
}): React.JSX.Element {
  return (
    <PopoverContent side="right" align="end" sideOffset={10} className="w-64 p-2">
      <div className="flex items-center gap-2.5 p-2">
        <AccountAvatar email={user?.email} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium">{user?.name ?? user?.email ?? "Member"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user?.email ?? user?.role ?? "reviewer"}
          </p>
        </div>
      </div>
      <div className="my-1.5 border-t border-border" />
      <div className="px-2 py-1.5">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Appearance
        </p>
        <ThemeToggle />
      </div>
      <ActiveOrgSwitcher />
      <div className="my-1.5 border-t border-border" />
      <Button
        type="button"
        variant="ghost"
        onClick={signOut}
        disabled={signingOut}
        className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="size-4" />
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
    </PopoverContent>
  );
}

function AccountMenu({ user }: { readonly user: AccountUser | null }): React.JSX.Element {
  const { signOut, signingOut } = useSignOut();
  return (
    <Popover>
      <SidebarMenuItem>
        <PopoverTrigger asChild>
          <SidebarMenuButton size="lg" tooltip={user?.email ?? "Account"}>
            <AccountAvatar email={user?.email} />
            <div className="flex-1 min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user?.name ?? user?.email ?? "Member"}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/45">
                {user?.role ?? "reviewer"}
              </p>
            </div>
            <ChevronsUpDown className="size-4 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </PopoverTrigger>
      </SidebarMenuItem>
      <AccountMenuPanel user={user} signOut={signOut} signingOut={signingOut} />
    </Popover>
  );
}

function TopBar({ context }: { readonly context: string }): React.JSX.Element {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/75 px-4 backdrop-blur-xl">
      <SidebarTrigger />
      <span className="h-5 w-px bg-border" aria-hidden="true" />
      <span className="text-[15px] font-semibold tracking-[-0.01em]">{context}</span>
      <div className="ml-auto">
        <NotificationBell />
      </div>
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
  const { data: me } = useQuery(meQueryOptions());
  const isAdmin = me?.user.role === "admin";
  const displayRole = me?.user.role ?? "reviewer";
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <BrandMark />
        </SidebarHeader>
        <SidebarContent>
          <NavGroup isAdmin={Boolean(isAdmin)} />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <AccountMenu user={session?.user ? { ...session.user, role: displayRole } : null} />
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <TopBar context={context} />
        {children}
      </SidebarInset>
      <ChatPanel />
    </SidebarProvider>
  );
}
