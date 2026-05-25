import type { Control } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { ReviewerActionEnum, type ReviewerAction, type ReviewerActionRequest } from "@mizan/shared";
import { Button } from "@/components/ui/button.tsx";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";

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

export function ActionRadioField({ control, pending }: ActionRadioFieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="action"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Action</FormLabel>
          <FormControl>
            <fieldset className="space-y-2">
              {ReviewerActionEnum.options.map((action) => (
                <div key={action} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`action-${action}`}
                    value={action}
                    checked={field.value === action}
                    onChange={() => field.onChange(action)}
                    disabled={pending}
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

interface RationaleFieldProps {
  readonly control: Control<ReviewerActionRequest>;
  readonly pending: boolean;
  readonly requiresRationale: boolean;
}

export function RationaleField({
  control,
  pending,
  requiresRationale,
}: RationaleFieldProps): React.JSX.Element {
  return (
    <FormField
      control={control}
      name="rationale"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{requiresRationale ? "Rationale required" : "Rationale (optional)"}</FormLabel>
          <FormControl>
            <Textarea
              {...field}
              disabled={pending}
              placeholder={
                requiresRationale
                  ? "Explain why (≥ 8 characters for override and block)"
                  : "Optional notes for the audit trail"
              }
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface SubmitActionButtonProps {
  readonly pending: boolean;
  readonly disabled: boolean;
}

export function SubmitActionButton({
  pending,
  disabled,
}: SubmitActionButtonProps): React.JSX.Element {
  return (
    <Button type="submit" disabled={disabled}>
      {pending ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" />
          Submitting…
        </>
      ) : (
        "Submit"
      )}
    </Button>
  );
}
