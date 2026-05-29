import { useMatchRoute, useParams } from "@tanstack/react-router";
import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";

const QUEUE_PROMPTS = [
  "Show my SUSPENDED_HITL cases",
  "What changed today?",
  "Who is admin in this org?",
  "List my recent actions",
] as const;

const CASE_PROMPTS = [
  "Summarize this case's signals",
  "What does the brief recommend?",
  "Show this case's audit history",
  "Look up clause `zakat.local_first`",
] as const;

/**
 * Route-aware starter prompts for an empty copilot thread.
 */
export function ChatEmptyState({
  onPickPrompt,
}: {
  readonly onPickPrompt: (prompt: string) => void;
}): React.JSX.Element {
  const matchRoute = useMatchRoute();
  const params = useParams({ strict: false });
  const onCaseDetail = Boolean(matchRoute({ to: "/case/$caseId" }) && params.caseId);
  const prompts = onCaseDetail ? CASE_PROMPTS : QUEUE_PROMPTS;

  return (
    <div className="space-y-3 px-3 py-2">
      <div className="rounded-md border border-dashed border-border/50 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{COPY.chat.emptyTitle}</p>
        <p className="mt-1">{COPY.chat.emptyDescription}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            size="sm"
            variant="outline"
            className="h-auto whitespace-normal text-left text-xs"
            onClick={() => onPickPrompt(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  );
}
