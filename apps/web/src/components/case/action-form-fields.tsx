import type { Control } from "react-hook-form";
import { ReviewerActionEnum, type ReviewerAction, type ReviewerActionRequest } from "@mizan/shared";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form.tsx";
import { Label } from "@/components/ui/label.tsx";
import { InfoHint } from "@/components/ui/info-hint.tsx";
import { COPY } from "@/lib/copy-constants.ts";

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

/** Radio group for selecting the reviewer action disposition. */
export function ActionRadioField({ control, pending }: ActionRadioFieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="action"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-1">
            Action
            <InfoHint label={COPY.hints.actionTypes} />
          </FormLabel>
          <FormControl>
            <fieldset className="space-y-2">
              <legend className="sr-only">Action</legend>
              {ReviewerActionEnum.options.map((action) => (
                <div key={action} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`action-${action}`}
                    value={action}
                    checked={field.value === action}
                    onChange={() => field.onChange(action)}
                    disabled={pending}
                    aria-label={ACTION_LABELS[action]}
                  />
                  <Label htmlFor={`action-${action}`}>{ACTION_LABELS[action]}</Label>
                </div>
              ))}
            </fieldset>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
