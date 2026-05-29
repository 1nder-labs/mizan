import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { GetBriefBody } from "@/components/chat/tool-bodies/get-brief-body.tsx";
import { GetCaseBody } from "@/components/chat/tool-bodies/get-case-body.tsx";
import { GetPolicyClauseBody } from "@/components/chat/tool-bodies/get-policy-clause-body.tsx";
import {
  ListAuditBody,
  ListCasesBody,
  ListSignalsBody,
  ListTeamBody,
  SearchPolicyBody,
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

/** Maps a tool name to its done-state body element. */
function DoneBody({
  toolName,
  output,
}: {
  readonly toolName: string;
  readonly output: unknown;
}): React.JSX.Element {
  if (toolName === "list_cases") return <ListCasesBody output={output} />;
  if (toolName === "list_signals") return <ListSignalsBody output={output} />;
  if (toolName === "list_team") return <ListTeamBody output={output} />;
  if (toolName === "list_audit") return <ListAuditBody output={output} />;
  if (toolName === "get_case") return <GetCaseBody output={output} />;
  if (toolName === "get_brief") return <GetBriefBody output={output} />;
  if (toolName === "get_policy_clause") return <GetPolicyClauseBody output={output} />;
  if (toolName === "search_policy") return <SearchPolicyBody output={output} />;
  return <p className="text-xs text-muted-foreground">{COPY.chat.listEmpty}</p>;
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
      {done ? (
        <div className="mt-2">
          <DoneBody toolName={toolName} output={part.output} />
        </div>
      ) : null}
    </div>
  );
}
