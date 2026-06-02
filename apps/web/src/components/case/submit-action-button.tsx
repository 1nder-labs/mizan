import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

interface SubmitActionButtonProps {
  readonly pending: boolean;
  readonly disabled: boolean;
}

/** Submit button for the reviewer-action form, with a pending spinner. */
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
