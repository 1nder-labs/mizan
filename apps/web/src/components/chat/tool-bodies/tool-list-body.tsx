import { Link } from "@tanstack/react-router";
import { COPY } from "@/lib/copy-constants.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-2">
      {truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{COPY.chat.listTruncated}</p>
      ) : null}
      <ul className="space-y-1 text-xs">
        {rows.slice(0, 50).map((row, index) => {
          const label = rowKey(row, index);
          const caseId = linkCaseId(row);
          if (caseId) {
            return (
              <li key={label}>
                <Link className="underline" to="/case/$caseId" params={{ caseId }}>
                  {label}
                </Link>
              </li>
            );
          }
          return (
            <li key={label} className="text-muted-foreground">
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function listCasesBody(output: unknown): React.JSX.Element {
  return (
    <ToolListBody
      rows={readRows(output, "cases")}
      truncated={readTruncated(output)}
      emptyMessage={COPY.chat.listEmpty}
      rowKey={(row, index) => {
        if (typeof row["category"] === "string" && typeof row["id"] === "string") {
          return `${row["category"]} · ${row["id"].slice(0, 8)}`;
        }
        return `case-${index}`;
      }}
      linkCaseId={(row) => (typeof row["id"] === "string" ? row["id"] : null)}
    />
  );
}

export function listSignalsBody(output: unknown): React.JSX.Element {
  return (
    <ToolListBody
      rows={readRows(output, "signals")}
      truncated={false}
      emptyMessage={COPY.chat.listEmpty}
      rowKey={(row, index) =>
        typeof row["signal_type"] === "string" ? row["signal_type"] : `signal-${index}`
      }
      linkCaseId={() => null}
    />
  );
}

export function listTeamBody(output: unknown): React.JSX.Element {
  return (
    <ToolListBody
      rows={readRows(output, "members")}
      truncated={false}
      emptyMessage={COPY.chat.listEmpty}
      rowKey={(row, index) => (typeof row["email"] === "string" ? row["email"] : `member-${index}`)}
      linkCaseId={() => null}
    />
  );
}

export function listAuditBody(output: unknown): React.JSX.Element {
  return (
    <ToolListBody
      rows={readRows(output, "entries")}
      truncated={readTruncated(output)}
      emptyMessage={COPY.chat.listEmpty}
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
