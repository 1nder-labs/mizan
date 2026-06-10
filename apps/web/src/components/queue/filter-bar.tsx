/**
 * Queue filter row — status tabs (table view) + a free-text search bar and
 * category / country dropdowns. Every control writes into URL search params via
 * `onSearchChange`; the worker ANDs them into a single case-insensitive query,
 * so "Education + PK" returns exactly the cases matching both.
 */
import { Archive, Check, ChevronsUpDown, Search } from "lucide-react";
import { useState } from "react";
import {
  CAMPAIGN_CATEGORY_OPTIONS,
  COUNTRIES,
  isCaseStatus,
  REVIEWER_DISPOSITION_LABEL,
  type CaseDisposition,
  type CaseStatus,
  type QueueSearch,
} from "@mizan/shared";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { CASE_STATUS_LABEL } from "@/lib/display-labels.ts";
import { formatCountry } from "@/lib/display-labels.ts";

const ALL_VALUE = "__all__";

const FILTER_STATUSES: readonly CaseStatus[] = [
  "QUEUED",
  "RUNNING",
  "SUSPENDED_HITL",
  "ACTIONED",
  "FAILED",
];

const STATUS_TABS: readonly { readonly value: "all" | CaseStatus; readonly label: string }[] = [
  { value: "all", label: "All" },
  ...FILTER_STATUSES.map((status) => ({ value: status, label: CASE_STATUS_LABEL[status] })),
];

/** Outcome buckets a reviewer triages by — the post-decision subset of dispositions. */
const FILTER_OUTCOMES: readonly CaseDisposition[] = [
  "AWAITING_REVIEWER",
  "NEEDS_CLIENT_DOCS",
  "CLIENT_REPLIED",
  "ESCALATED",
  "APPROVED",
  "DECLINED",
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
    if (isCaseStatus(value)) onSearchChange({ status: value, outcome: undefined });
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

/** Free-text search committed on submit; clears back to no filter. */
function SearchBar({
  value,
  onCommit,
}: {
  readonly value: string | undefined;
  readonly onCommit: (next: string | undefined) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        onCommit(draft.trim() || undefined);
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search campaigns…"
          aria-label="Search campaigns"
          className="h-9 w-60 pl-8"
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

/** Category dropdown sourced from the campaign taxonomy. */
function CategorySelect({
  value,
  onChange,
}: {
  readonly value: string | undefined;
  readonly onChange: (next: string | undefined) => void;
}): React.JSX.Element {
  return (
    <Select
      value={value ?? ALL_VALUE}
      onValueChange={(next) => onChange(next === ALL_VALUE ? undefined : next)}
    >
      <SelectTrigger className="h-9 w-48" aria-label="Filter by category">
        <SelectValue placeholder="Category" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>All categories</SelectItem>
        {CAMPAIGN_CATEGORY_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Outcome dropdown — narrows the queue to one canonical disposition bucket. */
function OutcomeSelect({
  value,
  onChange,
}: {
  readonly value: CaseDisposition | undefined;
  readonly onChange: (next: CaseDisposition | undefined) => void;
}): React.JSX.Element {
  return (
    <Select
      value={value ?? ALL_VALUE}
      onValueChange={(next) =>
        onChange(next === ALL_VALUE ? undefined : FILTER_OUTCOMES.find((o) => o === next))
      }
    >
      <SelectTrigger className="h-9 w-48" aria-label="Filter by outcome">
        <SelectValue placeholder="Outcome" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>All outcomes</SelectItem>
        {FILTER_OUTCOMES.map((outcome) => (
          <SelectItem key={outcome} value={outcome}>
            {REVIEWER_DISPOSITION_LABEL[outcome]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The "all" sentinel + one option per country, with a selected check. */
function CountryOptions({
  value,
  onSelect,
}: {
  readonly value: string | undefined;
  readonly onSelect: (next: string | undefined) => void;
}): React.JSX.Element {
  return (
    <CommandGroup>
      <CommandItem value="all countries" onSelect={() => onSelect(undefined)}>
        All countries
        {value ? null : <Check className="ml-auto size-3.5" />}
      </CommandItem>
      {COUNTRIES.map((country) => (
        <CommandItem
          key={country.code}
          value={`${country.name} ${country.code}`}
          onSelect={() => onSelect(country.code)}
        >
          {country.name}
          <span className="ml-auto font-numeric text-xs text-muted-foreground">{country.code}</span>
          {value === country.code ? <Check className="ml-1 size-3.5" /> : null}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** Searchable country combobox; the stored value is the ISO alpha-2 code. */
function CountryFilter({
  value,
  onChange,
}: {
  readonly value: string | undefined;
  readonly onChange: (next: string | undefined) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const select = (next: string | undefined): void => {
    onChange(next);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Filter by country"
          className="h-9 w-48 justify-between font-normal"
        >
          <span className="truncate">{value ? formatCountry(value) : "Country"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Search country…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CountryOptions value={value} onSelect={select} />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function QueueFilterBar({ search, onSearchChange }: FilterBarProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {search.view === "board" ? null : (
        <StatusTabs search={search} onSearchChange={onSearchChange} />
      )}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <SearchBar
          key={`title-${search.title ?? ""}`}
          value={search.title}
          onCommit={(next) => onSearchChange({ title: next })}
        />
        <CategorySelect
          value={search.category}
          onChange={(next) => onSearchChange({ category: next })}
        />
        <CountryFilter
          value={search.geography}
          onChange={(next) => onSearchChange({ geography: next })}
        />
        <div className="ml-auto flex items-center gap-2">
          <OutcomeSelect
            value={search.outcome}
            onChange={(next) => onSearchChange({ outcome: next, status: undefined })}
          />
          <Button
            variant={search.archived ? "default" : "outline"}
            size="sm"
            className="h-9"
            aria-pressed={search.archived ?? false}
            onClick={() => onSearchChange({ archived: search.archived ? undefined : true })}
          >
            <Archive className="mr-1.5 size-3.5" />
            Archived
          </Button>
        </div>
      </div>
    </div>
  );
}
