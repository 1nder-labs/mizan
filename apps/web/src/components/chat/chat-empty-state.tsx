import { useMatchRoute, useParams } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";

const QUEUE_PROMPTS = [
  "What's awaiting my review?",
  "Show unassigned cases in the queue",
  "Search policy for medical treatment eligibility",
  "Which of my cases changed most recently?",
] as const;

const CASE_PROMPTS = [
  "What evidence is missing on this case?",
  "Walk me through this case's trust signals and their scores",
  "Which policy clauses did the brief cite, and why?",
  "What should I ask the organizer before deciding?",
] as const;

/**
 * Route-aware starter prompts for an empty copilot thread. Every prompt maps
 * to a tool the copilot actually has: case-context prompts hit the per-case
 * tools, queue-context prompts stay inside list_cases filters + policy search.
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
    <div className="flex h-full flex-col justify-center gap-6 px-5 py-8">
      <div className="space-y-2">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <h2 className="text-lg font-semibold leading-snug text-foreground">
          {COPY.chat.emptyTitle}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {COPY.chat.emptyDescription}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {prompts.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="outline"
            className="h-auto justify-start whitespace-normal px-3 py-2 text-left text-sm font-normal text-foreground/90"
            onClick={() => onPickPrompt(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  );
}
