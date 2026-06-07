import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { m } from "framer-motion";

import { cn } from "@/lib/utils";
import { SPRING_PILL } from "@/lib/motion.ts";

/**
 * Tracks the active tab value + a per-list id so {@link TabsTrigger} can render
 * a single shared-layout pill that springs between triggers. A unique id per
 * list keeps multiple tab strips on one page from sharing (and fighting over)
 * the same `layoutId`.
 */
interface TabsState {
  readonly value: string | undefined;
  readonly listId: string;
}
const TabsStateContext = React.createContext<TabsState | null>(null);

function Tabs({ onValueChange, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const listId = React.useId();
  const [internal, setInternal] = React.useState(props.defaultValue);
  const active = props.value ?? internal;
  const handleChange = (next: string) => {
    if (props.value === undefined) setInternal(next);
    onValueChange?.(next);
  };
  return (
    <TabsStateContext.Provider value={{ value: active, listId }}>
      <TabsPrimitive.Root onValueChange={handleChange} {...props} />
    </TabsStateContext.Provider>
  );
}

function TabsList({ className, ref, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex h-auto items-center justify-start gap-0.5 border-b border-border text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  children,
  value,
  ref,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const state = React.useContext(TabsStateContext);
  const isActive = state?.value === value;
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "relative inline-flex items-center justify-center whitespace-nowrap rounded-t-md px-3.5 py-2 text-sm font-medium text-muted-foreground ring-offset-background transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    >
      {isActive && state ? (
        <m.span
          aria-hidden
          layoutId={`tab-pill-${state.listId}`}
          transition={SPRING_PILL}
          className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-foreground"
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
