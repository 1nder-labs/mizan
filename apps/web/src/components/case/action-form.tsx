import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  RATIONALE_REQUIRED_ACTIONS,
  ReviewerActionRequestSchema,
  type ReviewerActionRequest,
} from "@mizan/shared";
import { Form } from "@/components/ui/form.tsx";
import { ActionRadioField } from "./action-form-fields.tsx";
import { RationaleField } from "./rationale-field.tsx";
import { SubmitActionButton } from "./submit-action-button.tsx";

interface ActionFormProps {
  readonly pending: boolean;
  readonly onSubmit: (payload: ReviewerActionRequest) => Promise<void>;
}

export function ActionForm({ pending, onSubmit }: ActionFormProps): React.JSX.Element {
  const form = useForm<ReviewerActionRequest>({
    resolver: zodResolver(ReviewerActionRequestSchema),
    defaultValues: {
      action: "APPROVE",
      rationale: "",
      action_id: crypto.randomUUID(),
    },
    mode: "onChange",
  });

  const selectedAction = form.watch("action");
  const requiresRationale = RATIONALE_REQUIRED_ACTIONS.has(selectedAction);

  return (
    <Form {...form}>
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values);
        })}
      >
        <ActionRadioField control={form.control} pending={pending} />
        <div className="border-t border-border/40 pt-4">
          <RationaleField
            control={form.control}
            pending={pending}
            requiresRationale={requiresRationale}
          />
        </div>
        <SubmitActionButton pending={pending} disabled={pending || !form.formState.isValid} />
      </form>
    </Form>
  );
}
