import type { Control } from "react-hook-form";
import { ReviewerActionEnum, type ReviewerAction, type ReviewerActionRequest } from "@mizan/shared";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form.tsx";
import { InfoHint } from "@/components/ui/info-hint.tsx";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";

const ACTION_LABELS: Record<ReviewerAction, string> = {
  APPROVE: "Approve",
  REQUEST_DOCS: "Request docs",
  ESCALATE: "Escalate",
  BLOCK: "Block",
  OVERRIDE: "Override",
};

interface ActionRadioFieldProps {
  readonly control: Control<ReviewerActionRequest>;
  readonly pending: boolean;
}

/** Single accent-bar radio row for one action option. */
function ActionRadioRow({
  action,
  selected,
  pending,
  onSelect,
}: {
  readonly action: ReviewerAction;
  readonly selected: boolean;
  readonly pending: boolean;
  readonly onSelect: (action: ReviewerAction) => void;
}): React.JSX.Element {
  return (
    <label
      htmlFor={`action-${action}`}
      className={cn(
        "relative flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 pl-4",
        "transition-colors",
        "before:absolute before:inset-y-2 before:left-0 before:w-[3px]",
        "before:rounded-r-full before:transition-colors",
        selected
          ? "bg-muted/60 before:bg-foreground text-foreground"
          : "before:bg-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground",
        pending ? "cursor-not-allowed opacity-60" : "",
      )}
    >
      <input
        type="radio"
        id={`action-${action}`}
        value={action}
        checked={selected}
        onChange={() => onSelect(action)}
        disabled={pending}
        aria-label={ACTION_LABELS[action]}
        className="sr-only"
      />
      <span className="text-sm font-medium">{ACTION_LABELS[action]}</span>
    </label>
  );
}

/** Radio group for selecting the reviewer action disposition. */
export function ActionRadioField({ control, pending }: ActionRadioFieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="action"
      render={({ field }) => (
        <FormItem>
          <FormLabel
            className={cn(
              "flex items-center gap-1 text-[10px] font-medium",
              "uppercase tracking-[0.18em] text-muted-foreground",
            )}
          >
            Action
            <InfoHint label={COPY.hints.actionTypes} />
          </FormLabel>
          <FormControl>
            <fieldset className="space-y-1">
              <legend className="sr-only">Action</legend>
              {ReviewerActionEnum.options.map((action) => (
                <ActionRadioRow
                  key={action}
                  action={action}
                  selected={field.value === action}
                  pending={pending}
                  onSelect={field.onChange}
                />
              ))}
            </fieldset>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
