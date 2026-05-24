/**
 * Queue filter row — status tabs + free-text category filter. All
 * controls write into URL search params via the `onSearchChange`
 * callback; nothing lives in component state except the small input
 * draft for ergonomics.
 */
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { isCaseStatus, type CaseStatus, type QueueSearch } from "@mizan/shared";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";

const STATUS_TABS: readonly { readonly value: "all" | CaseStatus; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "QUEUED", label: "Queued" },
  { value: "RUNNING", label: "Running" },
  { value: "READY_FOR_REVIEW", label: "Ready" },
  { value: "SUSPENDED_HITL", label: "Awaiting" },
  { value: "ACTIONED", label: "Actioned" },
  { value: "FAILED", label: "Failed" },
];

interface FilterBarProps {
  readonly search: QueueSearch;
  readonly onSearchChange: (next: Partial<QueueSearch>) => void;
}

function StatusTabs({ search, onSearchChange }: FilterBarProps): React.JSX.Element {
  const activeTab: "all" | CaseStatus = search.status ?? "all";

  function handleChange(value: string): void {
    if (value === "all") {
      onSearchChange({ status: undefined });
      return;
    }
    if (isCaseStatus(value)) {
      onSearchChange({ status: value });
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={handleChange}>
      <TabsList>
        {STATUS_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function CategoryFilter({ search, onSearchChange }: FilterBarProps): React.JSX.Element {
  const [draft, setDraft] = useState(search.category ?? "");
  const externalCategory = search.category ?? "";
  useEffect(() => {
    setDraft(externalCategory);
  }, [externalCategory]);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSearchChange({ category: draft || undefined });
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Filter by category"
          className="h-9 w-56 pl-8"
          aria-label="Filter by category"
        />
      </div>
      {search.category ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft("");
            onSearchChange({ category: undefined });
          }}
        >
          Clear
        </Button>
      ) : null}
    </form>
  );
}

export function QueueFilterBar(props: FilterBarProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <StatusTabs {...props} />
      <CategoryFilter {...props} />
    </div>
  );
}
