import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
  SidebarContext,
} from "./sidebar-context";
import type { SidebarCSSVars, SidebarContextProps } from "./sidebar-context";
import { useIsMobile } from "@/hooks/use-mobile";

type SidebarProviderProps = React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Builds the keyboard shortcut effect for toggling the sidebar. */
function useSidebarKeyboardShortcut(toggleSidebar: () => void) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);
}

/** Builds the setOpen callback that also persists state to a cookie. */
function useSidebarOpenState(
  openProp: boolean | undefined,
  setOpenProp: ((open: boolean) => void) | undefined,
  defaultOpen: boolean,
): [boolean, (value: boolean | ((value: boolean) => boolean)) => void] {
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open],
  );

  return [open, setOpen];
}

/** Builds the memoized sidebar context value (state + toggle + mobile flags). */
function useSidebarContextValue(
  openProp: boolean | undefined,
  setOpenProp: ((open: boolean) => void) | undefined,
  defaultOpen: boolean,
): SidebarContextProps {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [open, setOpen] = useSidebarOpenState(openProp, setOpenProp, defaultOpen);
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((o) => !o) : setOpen((o) => !o);
  }, [isMobile, setOpen]);
  useSidebarKeyboardShortcut(toggleSidebar);
  const state = open ? "expanded" : "collapsed";
  return React.useMemo<SidebarContextProps>(
    () => ({ state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar],
  );
}

/** Provider that supplies sidebar state and toggle controls to the tree. */
function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const contextValue = useSidebarContextValue(openProp, setOpenProp, defaultOpen);
  const styleVars: SidebarCSSVars = {
    "--sidebar-width": SIDEBAR_WIDTH,
    "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
    ...style,
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          style={styleVars}
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

export { SidebarProvider };
export type { SidebarProviderProps };
