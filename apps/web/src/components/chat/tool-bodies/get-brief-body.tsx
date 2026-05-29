function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
  if (!brief) return <p className="text-xs text-muted-foreground">No brief available.</p>;
  const recommendation =
    typeof brief["recommendation"] === "string" ? brief["recommendation"] : "unknown";
  const confidence = typeof brief["confidence"] === "number" ? brief["confidence"] : null;
  return (
    <div className="space-y-1 text-xs">
      <p>
        Recommendation: <span className="font-medium">{recommendation}</span>
      </p>
      {confidence !== null ? (
        <p className="text-muted-foreground">Confidence: {confidence.toFixed(2)}</p>
      ) : null}
    </div>
  );
}
