import { Check, ChevronsUpDown } from "lucide-react";
import { useId, useState } from "react";
import type { CountryOption } from "../../hooks/use-countries.ts";
import { useCountries } from "../../hooks/use-countries.ts";
import { COPY } from "../../lib/copy-constants.ts";
import { cn } from "../../lib/utils.ts";
import { Button } from "../ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";

interface CountryComboboxProps {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly id?: string;
  readonly invalid?: boolean;
}

function CountryItems({
  countries,
  value,
  onSelect,
}: {
  readonly countries: readonly CountryOption[];
  readonly value: string;
  readonly onSelect: (code: string) => void;
}) {
  return (
    <CommandGroup>
      {countries.map((c) => (
        <CommandItem key={c.code} value={c.name} onSelect={() => onSelect(c.code)}>
          <span aria-hidden className="mr-2">
            {c.flag}
          </span>
          {c.name}
          <Check className={cn("ml-auto size-4", value === c.code ? "opacity-100" : "opacity-0")} />
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/**
 * Searchable country picker (Popover + cmdk). Renders flag + name, searches by
 * name, and stores the ISO code. Options come from `useCountries` (live
 * open-source API, bundled fallback), so the list is always populated.
 */
export function CountryCombobox({ value, onChange, id, invalid }: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const countries = useCountries();
  const selected = countries.find((c) => c.code === value);
  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-invalid={invalid}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <span aria-hidden>{selected.flag}</span>
              {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">{COPY.portal.countryPlaceholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] rounded-xl border-border/60 p-0 shadow-elev-2"
        align="start"
      >
        <Command>
          <CommandInput placeholder={COPY.portal.countrySearch} className="h-9" />
          <CommandList id={listId}>
            <CommandEmpty>{COPY.portal.countryEmpty}</CommandEmpty>
            <CountryItems countries={countries} value={value} onSelect={choose} />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
