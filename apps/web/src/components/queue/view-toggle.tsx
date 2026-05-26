/**
 * URL-backed view selector for `/queue` — toggles `?view=board|table`
 * via TanStack Router's `navigate`. The active state lifts via inset
 * shadow + foreground text so the eye can find the selection in one
 * glance.
 */
import { useNavigate } from "@tanstack/react-router";
import { LayoutGrid, Rows3 } from "lucide-react";
import type { QueueView } from "@mizan/shared";
import { cn } from "@/lib/utils.ts";
import { COPY } from "@/lib/copy-constants.ts";

interface ViewToggleProps {
  readonly current: QueueView;
}

interface OptionSpec {
  readonly value: QueueView;
  readonly label: string;
  readonly icon: typeof LayoutGrid;
}

const OPTIONS: readonly OptionSpec[] = [
  { value: "board", label: COPY.queue.viewBoardLabel, icon: LayoutGrid },
  { value: "table", label: COPY.queue.viewTableLabel, icon: Rows3 },
];

function ToggleOption({
  option,
  current,
  onSelect,
}: {
  readonly option: OptionSpec;
  readonly current: QueueView;
  readonly onSelect: (view: QueueView) => void;
}): React.JSX.Element {
  const active = option.value === current;
  const Icon = option.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      aria-pressed={active}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-all duration-200",
        active
          ? "bg-card text-foreground shadow-elev-1"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {option.label}
    </button>
  );
}

export function ViewToggle({ current }: ViewToggleProps): React.JSX.Element {
  const navigate = useNavigate({ from: "/queue" });
  const setView = (view: QueueView): void => {
    void navigate({ search: (prev) => ({ ...prev, view }), replace: true });
  };
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-0.5">
      {OPTIONS.map((option) => (
        <ToggleOption key={option.value} option={option} current={current} onSelect={setView} />
      ))}
    </div>
  );
}
