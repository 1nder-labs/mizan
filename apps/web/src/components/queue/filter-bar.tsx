/**
 * Queue filter row — status tabs + free-text category filter. All
 * controls write into URL search params via the `onSearchChange`
 * callback; nothing lives in component state except the small input
 * draft for ergonomics.
 */
import { Search } from "lucide-react";
import { useState } from "react";
import { isCaseStatus, type CaseStatus, type QueueSearch } from "@mizan/shared";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { CASE_STATUS_LABEL } from "@/lib/display-labels.ts";

const FILTER_STATUSES: readonly CaseStatus[] = [
  "QUEUED",
  "RUNNING",
  "READY_FOR_REVIEW",
  "SUSPENDED_HITL",
  "ACTIONED",
  "FAILED",
];

const STATUS_TABS: readonly { readonly value: "all" | CaseStatus; readonly label: string }[] = [
  { value: "all", label: "All" },
  ...FILTER_STATUSES.map((status) => ({ value: status, label: CASE_STATUS_LABEL[status] })),
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

interface TextFilterProps {
  readonly value: string | undefined;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly inputWidthClass: string;
  readonly onCommit: (next: string | undefined) => void;
}

function TextFilter({
  value,
  placeholder,
  ariaLabel,
  inputWidthClass,
  onCommit,
}: TextFilterProps): React.JSX.Element {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onCommit(draft || undefined);
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          className={`h-9 ${inputWidthClass} pl-8`}
          aria-label={ariaLabel}
        />
      </div>
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft("");
            onCommit(undefined);
          }}
        >
          Clear
        </Button>
      ) : null}
    </form>
  );
}

export function QueueFilterBar({ search, onSearchChange }: FilterBarProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <StatusTabs search={search} onSearchChange={onSearchChange} />
      <div className="flex flex-wrap items-center gap-2">
        <TextFilter
          key={search.category ?? ""}
          value={search.category}
          placeholder="Filter by category"
          ariaLabel="Filter by category"
          inputWidthClass="w-56"
          onCommit={(next) => onSearchChange({ category: next })}
        />
        <TextFilter
          key={search.geography ?? ""}
          value={search.geography}
          placeholder="Country (e.g. PS, ID)"
          ariaLabel="Filter by geography"
          inputWidthClass="w-44"
          onCommit={(next) => onSearchChange({ geography: next })}
        />
      </div>
    </div>
  );
}
