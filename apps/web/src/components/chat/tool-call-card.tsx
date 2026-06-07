import { m } from "framer-motion";
import { COPY } from "@/lib/copy-constants.ts";
import { reveal } from "@/lib/motion.ts";
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

/** Header strip: tool name (or queued label) + a loading pulse or done check. */
function ToolCardHeader({
  toolName,
  loading,
  done,
}: {
  readonly toolName: string;
  readonly loading: boolean;
  readonly done: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-2">
      <span
        className={[
          "select-none font-mono text-[10px] font-medium uppercase",
          "tracking-[0.18em] text-muted-foreground/70",
        ].join(" ")}
      >
        {loading && !done ? COPY.chat.toolQueued(toolName) : toolName}
      </span>
      {loading && !done ? (
        <span className="ml-auto inline-block h-1.5 w-12 animate-pulse rounded-full bg-muted-foreground/20" />
      ) : null}
      {done ? (
        <span
          className={[
            "ml-auto inline-flex h-4 w-4 items-center justify-center",
            "rounded-full bg-muted text-[9px] font-medium text-muted-foreground",
          ].join(" ")}
        >
          ✓
        </span>
      ) : null}
    </div>
  );
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
    <m.div
      className="overflow-hidden rounded-lg border border-border/50 bg-card text-sm shadow-elev-1"
      {...reveal}
    >
      <ToolCardHeader toolName={toolName} loading={loading} done={done} />
      {loading && !done ? (
        <div className="space-y-2 p-3">
          <div className="h-3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ) : null}
      {errored ? (
        <div role="alert" className="space-y-2 p-3 text-destructive">
          <p className="break-words text-xs">{COPY.chat.toolError}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onRetry}
          >
            {COPY.chat.retryLabel}
          </Button>
        </div>
      ) : null}
      {done ? (
        <div className="p-3">
          <DoneBody toolName={toolName} output={part.output} />
        </div>
      ) : null}
    </m.div>
  );
}
