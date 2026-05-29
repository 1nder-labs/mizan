function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Renders a policy clause lookup result.
 */
export function GetPolicyClauseBody({ output }: { readonly output: unknown }): React.JSX.Element {
  if (!isRecord(output)) {
    return <p className="text-xs text-muted-foreground">Clause not found.</p>;
  }
  const title = typeof output["title"] === "string" ? output["title"] : "Policy clause";
  const body = typeof output["body"] === "string" ? output["body"] : "";
  const clauseId = typeof output["clauseId"] === "string" ? output["clauseId"] : null;
  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium">
        {clauseId ? <code>{clauseId}</code> : null} {title}
      </p>
      {body.length > 0 ? <p className="text-muted-foreground line-clamp-4">{body}</p> : null}
    </div>
  );
}
