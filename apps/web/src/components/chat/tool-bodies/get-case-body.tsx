import { Link } from "@tanstack/react-router";
import { isRecord } from "./is-record.ts";

/**
 * Unwraps the get_case tool output down to the case row. The tool returns
 * `{ case: <CaseDetailResponse> }`, and the detail response nests the row again
 * under its own `case` key — so the actual row lives at `output.case.case`.
 * Reading `output.case` alone yields the wrapper (no `id`) and renders a
 * misleading "Case not found".
 */
function readCaseRow(output: unknown): Record<string, unknown> | null {
  if (!isRecord(output)) return null;
  const detail = output["case"];
  if (!isRecord(detail)) return null;
  const row = detail["case"];
  return isRecord(row) ? row : null;
}

/** One label/value line in the case tool result. */
function FieldRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Renders a single-case tool result with click-through to case detail. */
export function GetCaseBody({ output }: { readonly output: unknown }): React.JSX.Element {
  const row = readCaseRow(output);
  const caseId = row && typeof row["id"] === "string" ? row["id"] : null;
  if (!row || !caseId) {
    return <p className="text-xs text-muted-foreground/60 italic">Case not found.</p>;
  }
  const title = typeof row["title"] === "string" ? row["title"] : null;
  const category = typeof row["category"] === "string" ? row["category"] : "case";
  const status = typeof row["status"] === "string" ? row["status"] : "unknown";
  return (
    <div className="space-y-2 text-xs">
      {title ? (
        <FieldRow label="case">
          <Link
            className="font-medium underline underline-offset-2 transition-colors hover:text-foreground"
            to="/case/$caseId"
            params={{ caseId }}
          >
            {title}
          </Link>
        </FieldRow>
      ) : null}
      <FieldRow label="id">
        <span className="font-mono font-numeric text-foreground/80">{caseId.slice(0, 8)}</span>
      </FieldRow>
      <FieldRow label="cat">
        <span className="capitalize text-foreground/80">{category}</span>
      </FieldRow>
      <FieldRow label="status">
        <span className="capitalize text-muted-foreground">{status}</span>
      </FieldRow>
    </div>
  );
}
