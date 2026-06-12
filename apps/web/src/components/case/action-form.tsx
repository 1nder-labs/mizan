import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  RATIONALE_REQUIRED_ACTIONS,
  ReviewerActionRequestSchema,
  type Recommendation,
  type ReviewerAction,
  type ReviewerActionRequest,
} from "@mizan/shared";
import { Form } from "@/components/ui/form.tsx";
import { ActionRadioField } from "./action-form-fields.tsx";
import { RationaleField } from "./rationale-field.tsx";
import { SubmitActionButton } from "./submit-action-button.tsx";

/**
 * Maps the AI brief recommendation to the reviewer action it suggests (and which
 * radio the form pre-selects). `READY_FOR_REVIEW` maps to `APPROVE`: the brief's
 * "ready for review" verdict means nothing is blocking approval, so APPROVE is
 * the action it suggests — the reviewer still confirms by submitting.
 */
const RECOMMENDATION_TO_ACTION: Record<Recommendation, ReviewerAction> = {
  READY_FOR_REVIEW: "APPROVE",
  REQUEST_DOCS: "REQUEST_DOCS",
  ESCALATE: "ESCALATE",
  BLOCK: "BLOCK",
};

interface ActionFormProps {
  readonly pending: boolean;
  readonly onSubmit: (payload: ReviewerActionRequest) => Promise<void>;
  readonly recommendation?: Recommendation;
}

export function ActionForm({
  pending,
  onSubmit,
  recommendation,
}: ActionFormProps): React.JSX.Element {
  const suggestedAction = recommendation ? RECOMMENDATION_TO_ACTION[recommendation] : null;
  const form = useForm<ReviewerActionRequest>({
    resolver: zodResolver(ReviewerActionRequestSchema),
    defaultValues: {
      action: suggestedAction ?? "APPROVE",
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
        <ActionRadioField
          control={form.control}
          pending={pending}
          suggestedAction={suggestedAction}
        />
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
