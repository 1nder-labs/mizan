/**
 * Tool-call card. Models the Anthropic Console / Vercel AI Inspector
 * "tool use" cell: monospace tool name, status badge, collapsed input
 * preview that expands inline. Large payloads open in a `<Sheet>`
 * side drawer so the queue scroll position is preserved.
 *
 * `ToolPart` + `ToolState` live in `stream-types.ts` so the pure
 * fold layer can reference them without depending on this UI leaf.
 */
import { ChevronRight, Maximize2, Wrench } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet.tsx";
import { cn } from "@/lib/utils.ts";
import type { ToolPart, ToolState } from "./stream-types.ts";

const STATE_LABEL: Record<ToolState, string> = {
  "input-streaming": "Reading input",
  "input-available": "Running",
  "output-available": "Complete",
  "output-error": "Failed",
};

function stateBadgeClass(state: ToolState): string {
  if (state === "output-available")
    return "border-status-success-border bg-status-success text-status-success-foreground";
  if (state === "output-error")
    return "border-status-destructive-border bg-status-destructive text-status-destructive-foreground";
  return "border-status-info-border bg-status-info text-status-info-foreground";
}

function PayloadBlock({ value }: { readonly value: unknown }): React.JSX.Element {
  let serialized = "";
  try {
    serialized = JSON.stringify(value, null, 2);
  } catch {
    serialized = String(value);
  }
  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
      {serialized}
    </pre>
  );
}

/**
 * Renders the input / output / error trio for a tool invocation.
 * Used by both the inline-expanded card body and the side-drawer
 * detail view so payload formatting changes land once.
 */
function ToolPayloadSections({
  tool,
  errorBlockClass,
}: {
  readonly tool: ToolPart;
  readonly errorBlockClass: string;
}): React.JSX.Element {
  return (
    <>
      {tool.input !== undefined ? (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Input</p>
          <PayloadBlock value={tool.input} />
        </div>
      ) : null}
      {tool.output !== undefined ? (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Output</p>
          <PayloadBlock value={tool.output} />
        </div>
      ) : null}
      {tool.errorText ? (
        <div className={errorBlockClass}>{tool.errorText}</div>
      ) : null}
    </>
  );
}

function ExpandButton({ tool }: { readonly tool: ToolPart }): React.JSX.Element {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Expand tool payload">
          <Maximize2 className="size-3.5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">{tool.name}</SheetTitle>
          <SheetDescription>
            Full input + output payload for this tool invocation.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 overflow-auto px-4 pb-6">
          <ToolPayloadSections
            tool={tool}
            errorBlockClass="rounded-md border border-status-destructive-border bg-status-destructive p-3 text-xs text-status-destructive-foreground"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ToolHeader({
  tool,
  expanded,
  onToggle,
}: {
  readonly tool: ToolPart;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
        <ChevronRight
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            expanded ? "rotate-90" : null,
          )}
        />
        <Wrench className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-xs text-foreground">{tool.name}</span>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto text-[10px] uppercase tracking-wider",
            stateBadgeClass(tool.state),
          )}
        >
          {STATE_LABEL[tool.state]}
        </Badge>
      </button>
      <ExpandButton tool={tool} />
    </div>
  );
}

function ToolBody({ tool }: { readonly tool: ToolPart }): React.JSX.Element {
  return (
    <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-3">
      <ToolPayloadSections
        tool={tool}
        errorBlockClass="rounded-md border border-status-destructive-border bg-status-destructive p-2 text-xs text-status-destructive-foreground"
      />
    </div>
  );
}

export function ExtractionCard({ tool }: { readonly tool: ToolPart }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <article
      className={cn(
        "rounded-lg border border-border bg-card shadow-elev-1",
        tool.state === "output-error" && "border-status-destructive-border",
      )}
    >
      <ToolHeader tool={tool} expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
      {expanded ? <ToolBody tool={tool} /> : null}
    </article>
  );
}
