import { Link } from "@tanstack/react-router";
import { COPY } from "@/lib/copy-constants.ts";
import { isRecord } from "./is-record.ts";

function readRows(output: unknown, key: string): readonly Record<string, unknown>[] {
  if (!isRecord(output)) return [];
  const rows = output[key];
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is Record<string, unknown> => isRecord(row));
}

function readTruncated(output: unknown): boolean {
  if (!isRecord(output)) return false;
  return output["truncated"] === true;
}

/** One list row — a case-linked entry when the row carries a case id, else plain. */
function ToolListRow({
  row,
  index,
  rowKey,
  linkCaseId,
}: {
  readonly row: Record<string, unknown>;
  readonly index: number;
  readonly rowKey: (row: Record<string, unknown>, index: number) => string;
  readonly linkCaseId: (row: Record<string, unknown>) => string | null;
}): React.JSX.Element {
  const label = rowKey(row, index);
  const caseId = linkCaseId(row);
  if (caseId) {
    return (
      <li>
        <Link
          className="font-medium underline underline-offset-2 transition-colors hover:text-foreground"
          to="/case/$caseId"
          params={{ caseId }}
        >
          {label}
        </Link>
      </li>
    );
  }
  return <li className="text-muted-foreground">{label}</li>;
}

/**
 * Generic list renderer for list-shaped copilot tool outputs.
 */
export function ToolListBody({
  rows,
  truncated,
  rowKey,
  linkCaseId,
  emptyMessage,
}: {
  readonly rows: readonly Record<string, unknown>[];
  readonly truncated: boolean;
  readonly rowKey: (row: Record<string, unknown>, index: number) => string;
  readonly linkCaseId: (row: Record<string, unknown>) => string | null;
  readonly emptyMessage: string;
}): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground/60 italic">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-2">
      {truncated ? (
        <p className="text-[10px] font-medium uppercase tracking-wide text-status-warning-foreground">
          {COPY.chat.listTruncated}
        </p>
      ) : null}
      <ul className="space-y-1 text-xs">
        {rows.slice(0, 50).map((row, index) => (
          <ToolListRow
            key={`${index}-${rowKey(row, index)}`}
            row={row}
            index={index}
            rowKey={rowKey}
            linkCaseId={linkCaseId}
          />
        ))}
      </ul>
    </div>
  );
}

/** Renders the list_cases tool output as a linked case list. */
export function ListCasesBody({ output }: { readonly output: unknown }): React.JSX.Element {
  return (
    <ToolListBody
      rows={readRows(output, "cases")}
      truncated={readTruncated(output)}
      emptyMessage={COPY.chat.listEmpty}
      rowKey={(row, index) => {
        if (typeof row["title"] === "string" && row["title"].length > 0) return row["title"];
        const category = typeof row["category"] === "string" ? row["category"] : null;
        return category ?? `Case ${index + 1}`;
      }}
      linkCaseId={(row) => (typeof row["id"] === "string" ? row["id"] : null)}
    />
  );
}

/** Renders the list_signals tool output as a signal list. */
export function ListSignalsBody({ output }: { readonly output: unknown }): React.JSX.Element {
  return (
    <ToolListBody
      rows={readRows(output, "signals")}
      truncated={false}
      emptyMessage={COPY.chat.signalsEmpty}
      rowKey={(row, index) =>
        typeof row["signal_type"] === "string" ? row["signal_type"] : `signal-${index}`
      }
      linkCaseId={() => null}
    />
  );
}

/** Renders the list_team tool output as a member list. */
export function ListTeamBody({ output }: { readonly output: unknown }): React.JSX.Element {
  return (
    <ToolListBody
      rows={readRows(output, "members")}
      truncated={false}
      emptyMessage={COPY.chat.teamEmpty}
      rowKey={(row, index) => (typeof row["email"] === "string" ? row["email"] : `member-${index}`)}
      linkCaseId={() => null}
    />
  );
}

/** Renders the search_policy tool output as a ranked clause list. */
export function SearchPolicyBody({ output }: { readonly output: unknown }): React.JSX.Element {
  return (
    <ToolListBody
      rows={readRows(output, "results")}
      truncated={false}
      emptyMessage={COPY.chat.policySearchEmpty}
      rowKey={(row, index) => {
        if (typeof row["clauseId"] === "string" && typeof row["title"] === "string") {
          return `${row["clauseId"]} · ${row["title"]}`;
        }
        return `clause-${index}`;
      }}
      linkCaseId={() => null}
    />
  );
}

/** Renders the list_audit tool output as an audit entry list. */
export function ListAuditBody({ output }: { readonly output: unknown }): React.JSX.Element {
  return (
    <ToolListBody
      rows={readRows(output, "entries")}
      truncated={readTruncated(output)}
      emptyMessage={COPY.chat.auditEmpty}
      rowKey={(row, index) => {
        if (typeof row["action"] === "string" && typeof row["case_id"] === "string") {
          return `${row["action"]} · ${row["case_id"].slice(0, 8)}`;
        }
        return `audit-${index}`;
      }}
      linkCaseId={(row) => (typeof row["case_id"] === "string" ? row["case_id"] : null)}
    />
  );
}
