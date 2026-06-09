import type { Control } from "react-hook-form";
import type { ReviewerActionRequest } from "@mizan/shared";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

interface RationaleFieldProps {
  readonly control: Control<ReviewerActionRequest>;
  readonly pending: boolean;
  readonly requiresRationale: boolean;
}

/** Reviewer-action rationale textarea field. */
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
          <FormLabel className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {requiresRationale ? "Rationale required" : "Rationale (optional)"}
          </FormLabel>
          <FormControl>
            <Textarea
              {...field}
              disabled={pending}
              className="resize-none text-sm"
              rows={3}
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
