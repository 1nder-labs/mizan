import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { GetBriefBody } from "@/components/chat/tool-bodies/get-brief-body.tsx";
import { GetCaseBody } from "@/components/chat/tool-bodies/get-case-body.tsx";
import { GetPolicyClauseBody } from "@/components/chat/tool-bodies/get-policy-clause-body.tsx";
import {
  listAuditBody,
  listCasesBody,
  listSignalsBody,
  listTeamBody,
} from "@/components/chat/tool-bodies/tool-list-body.tsx";

interface ToolCallPart {
  readonly type: string;
  readonly toolCallId?: string;
  readonly state?: string;
  readonly errorText?: string;
  readonly output?: unknown;
}

function extractToolName(part: ToolCallPart): string {
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

function renderDoneBody(toolName: string, output: unknown): React.JSX.Element {
  switch (toolName) {
    case "list_cases":
      return listCasesBody(output);
    case "list_signals":
      return listSignalsBody(output);
    case "list_team":
      return listTeamBody(output);
    case "list_audit":
      return listAuditBody(output);
    case "get_case":
      return <GetCaseBody output={output} />;
    case "get_brief":
      return <GetBriefBody output={output} />;
    case "get_policy_clause":
      return <GetPolicyClauseBody output={output} />;
    default:
      return <p className="text-xs text-muted-foreground">{COPY.chat.listEmpty}</p>;
  }
}

/**
 * Inline tool-call frame with pending/loading/done/error states.
 */
export function ToolCallCard({
  part,
  onRetry,
}: {
  readonly part: ToolCallPart;
  readonly onRetry: () => void;
}): React.JSX.Element {
  const toolName = extractToolName(part);
  const state = part.state ?? "input-available";
  const errored = state === "output-error" || Boolean(part.errorText);
  const loading = state === "input-streaming" || state === "input-available";
  const done = state === "output-available";

  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-sm">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {loading && !done ? COPY.chat.toolQueued(toolName) : toolName}
      </p>
      {loading && !done ? <div className="mt-2 h-8 animate-pulse rounded bg-muted" /> : null}
      {errored ? (
        <div role="alert" className="mt-2 space-y-2 text-destructive">
          <p>{part.errorText ?? COPY.chat.toolError}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {COPY.chat.retryLabel}
          </Button>
        </div>
      ) : null}
      {done ? <div className="mt-2">{renderDoneBody(toolName, part.output)}</div> : null}
    </div>
  );
}
