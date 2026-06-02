import { Link } from "@tanstack/react-router";
import { isRecord } from "./is-record.ts";

function readCaseRecord(output: unknown): Record<string, unknown> | null {
  if (!isRecord(output)) return null;
  const detail = output["case"];
  if (!isRecord(detail)) return null;
  return detail;
}

/**
 * Renders a single-case tool result with click-through to case detail.
 */
export function GetCaseBody({ output }: { readonly output: unknown }): React.JSX.Element {
  const detail = readCaseRecord(output);
  if (!detail) return <p className="text-xs text-muted-foreground">Case not found.</p>;
  const caseId = typeof detail["id"] === "string" ? detail["id"] : null;
  const category = typeof detail["category"] === "string" ? detail["category"] : "case";
  const status = typeof detail["status"] === "string" ? detail["status"] : "unknown";
  if (!caseId) return <p className="text-xs text-muted-foreground">Case not found.</p>;
  return (
    <div className="space-y-1 text-xs">
      <p>
        <Link className="font-medium underline" to="/case/$caseId" params={{ caseId }}>
          {category}
        </Link>
      </p>
      <p className="text-muted-foreground">Status: {status}</p>
    </div>
  );
}
