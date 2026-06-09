import { isRecord } from "./is-record.ts";

function readBrief(output: unknown): Record<string, unknown> | null {
  if (!isRecord(output)) return null;
  const brief = output["brief"];
  if (!isRecord(brief)) return null;
  return brief;
}

/**
 * Renders brief recommendation and confidence from a get_brief tool result.
 */
export function GetBriefBody({ output }: { readonly output: unknown }): React.JSX.Element {
  const brief = readBrief(output);
  if (!brief) return <p className="text-xs italic text-muted-foreground/60">No brief available.</p>;
  const recommendation =
    typeof brief["recommendation"] === "string" ? brief["recommendation"] : "unknown";
  const confidence = typeof brief["confidence"] === "number" ? brief["confidence"] : null;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
          rec
        </span>
        <span className="font-medium capitalize text-foreground">{recommendation}</span>
      </div>
      {confidence !== null ? (
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
            conf
          </span>
          <span className="font-numeric tabular-nums text-muted-foreground">
            {confidence.toFixed(2)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
