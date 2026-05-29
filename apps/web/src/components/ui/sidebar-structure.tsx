import * as React from "react";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSidebar } from "./sidebar-context";
import type { SidebarCSSVars } from "./sidebar-context";
import { SIDEBAR_WIDTH_MOBILE } from "./sidebar-context";

type SidebarProps = React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
};

/** The non-collapsible desktop variant of the sidebar. */
function SidebarStatic({ className, children, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-full w-[var(--sidebar-width)] flex-col bg-sidebar text-sidebar-foreground",
        className,
      )}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  );
}

/** The mobile sheet variant of the sidebar. */
function SidebarMobile({
  side = "left",
  children,
  openMobile,
  setOpenMobile,
  ...props
}: {
  side?: "left" | "right";
  children: React.ReactNode;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
} & Omit<React.ComponentProps<"div">, "children">) {
  const mobileStyle: SidebarCSSVars = { "--sidebar-width": SIDEBAR_WIDTH_MOBILE };
  return (
    <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
      <SheetContent
        data-sidebar="sidebar"
        data-mobile="true"
        className="w-[var(--sidebar-width)] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
        style={mobileStyle}
        side={side}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Sidebar</SheetTitle>
          <SheetDescription>Displays the mobile sidebar.</SheetDescription>
        </SheetHeader>
        <div className="flex h-full w-full flex-col">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Class for the layout-gap div that reserves the desktop sidebar's width. */
function sidebarGapClass(variant: SidebarProps["variant"]): string {
  return cn(
    "relative w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear",
    "group-data-[collapsible=offcanvas]:w-0",
    "group-data-[side=right]:rotate-180",
    variant === "floating" || variant === "inset"
      ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]"
      : "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]",
  );
}

/** Class for the fixed desktop sidebar panel (side + variant aware). */
function sidebarFixedClass(
  side: SidebarProps["side"],
  variant: SidebarProps["variant"],
  className: string | undefined,
): string {
  return cn(
    "fixed inset-y-0 z-10 hidden h-svh w-[var(--sidebar-width)] transition-[left,right,width] duration-200 ease-linear md:flex",
    side === "left"
      ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
      : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
    variant === "floating" || variant === "inset"
      ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]"
      : "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)] group-data-[side=left]:border-r group-data-[side=right]:border-l",
    className,
  );
}

/** Desktop (md+) collapsible sidebar with the gap + fixed-rail layout. */
function SidebarDesktop({
  side,
  variant,
  collapsible,
  state,
  className,
  children,
  ref,
  ...props
}: SidebarProps & { state: string }) {
  return (
    <div
      ref={ref}
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
    >
      <div className={sidebarGapClass(variant)} />
      <div className={sidebarFixedClass(side, variant, className)} {...props}>
        <div
          data-sidebar="sidebar"
          className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Main sidebar component supporting collapsible and mobile sheet modes. */
function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ref,
  ...props
}: SidebarProps) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  if (collapsible === "none") {
    return (
      <SidebarStatic ref={ref} className={className} {...props}>
        {children}
      </SidebarStatic>
    );
  }
  if (isMobile) {
    return (
      <SidebarMobile side={side} openMobile={openMobile} setOpenMobile={setOpenMobile} {...props}>
        {children}
      </SidebarMobile>
    );
  }
  return (
    <SidebarDesktop
      side={side}
      variant={variant}
      collapsible={collapsible}
      state={state}
      className={className}
      ref={ref}
      {...props}
    >
      {children}
    </SidebarDesktop>
  );
}

/** Button that toggles sidebar open/closed state. */
function SidebarTrigger({
  className,
  onClick,
  ref,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

/** Draggable rail for resizing the sidebar on desktop. */
function SidebarRail({ className, ref, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      ref={ref}
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex",
        "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className,
      )}
      {...props}
    />
  );
}

/** Main content area adjacent to the sidebar. */
function SidebarInset({ className, ref, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      ref={ref}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col bg-background",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow",
        className,
      )}
      {...props}
    />
  );
}

/** Text input styled for use inside the sidebar. */
function SidebarInput({ className, ref, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      ref={ref}
      data-sidebar="input"
      className={cn(
        "h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className,
      )}
      {...props}
    />
  );
}

/** Header section at the top of the sidebar. */
function SidebarHeader({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

/** Footer section at the bottom of the sidebar. */
function SidebarFooter({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

/** Horizontal separator line styled for the sidebar. */
function SidebarSeparator({ className, ref, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      ref={ref}
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  );
}

/** Scrollable content area inside the sidebar. */
function SidebarContent({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarTrigger,
  SidebarRail,
  SidebarInset,
  SidebarInput,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  SidebarContent,
};
