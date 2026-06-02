import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils.ts";
import { COPY } from "@/lib/copy-constants.ts";

const OPTIONS = [
  { value: "system", label: COPY.theme.system, Icon: Monitor },
  { value: "light", label: COPY.theme.light, Icon: Sun },
  { value: "dark", label: COPY.theme.dark, Icon: Moon },
] as const;

/**
 * Icon-only system/light/dark segmented control for the sidebar footer.
 * Delegates to next-themes (the app's `ThemeProvider`); hidden when the
 * sidebar is collapsed to its icon rail.
 */
export function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label={COPY.theme.label}
      className="flex items-center gap-0.5 rounded-md border border-sidebar-border bg-sidebar-accent/40 p-0.5 group-data-[collapsible=icon]:hidden"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "grid h-7 flex-1 place-items-center rounded transition-colors",
            theme === value
              ? "bg-background text-foreground shadow-elev-1"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
