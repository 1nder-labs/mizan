import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ReviewerActionRequestSchema, type ReviewerActionRequest } from "@mizan/shared";
import { Form } from "@/components/ui/form.tsx";
import {
  ActionRadioField,
  RationaleField,
  SubmitActionButton,
} from "./action-form-fields.tsx";

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
  const requiresRationale = selectedAction === "OVERRIDE" || selectedAction === "BLOCK";

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit({
            ...values,
            action_id: crypto.randomUUID(),
          });
        })}
      >
        <ActionRadioField control={form.control} pending={pending} />
        <RationaleField
          control={form.control}
          pending={pending}
          requiresRationale={requiresRationale}
        />
        <SubmitActionButton pending={pending} disabled={pending || !form.formState.isValid} />
      </form>
    </Form>
  );
}
