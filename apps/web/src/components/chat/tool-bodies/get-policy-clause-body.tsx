import { isRecord } from "./is-record.ts";

/**
 * Renders a policy clause lookup result.
 */
export function GetPolicyClauseBody({ output }: { readonly output: unknown }): React.JSX.Element {
  if (!isRecord(output)) {
    return <p className="text-xs text-muted-foreground/60 italic">Clause not found.</p>;
  }
  const title = typeof output["title"] === "string" ? output["title"] : "Policy clause";
  const body = typeof output["body"] === "string" ? output["body"] : "";
  const clauseId = typeof output["clauseId"] === "string" ? output["clauseId"] : null;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-start gap-2">
        {clauseId ? (
          <code
            className={[
              "mt-px shrink-0 select-all font-mono text-[10px] font-medium uppercase",
              "tracking-widest text-muted-foreground/70",
            ].join(" ")}
          >
            {clauseId}
          </code>
        ) : null}
        <span className="font-medium leading-snug text-foreground">{title}</span>
      </div>
      {body.length > 0 ? (
        <p className="line-clamp-4 border-l-2 border-border/50 pl-2 leading-relaxed text-muted-foreground">
          {body}
        </p>
      ) : null}
    </div>
  );
}
