/**
 * Queue page summary header — case count and current sort description.
 * Extracted from the route file so fast-refresh works cleanly on the
 * route (which must also export the `Route` singleton).
 */
import type { QueueSearch } from "@mizan/shared";

export function QueueSummary({
  isPending,
  showing,
  total,
  sort,
}: {
  readonly isPending: boolean;
  readonly showing: number;
  readonly total: number;
  readonly sort: QueueSearch["sort"];
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <h1 className="text-display text-3xl font-semibold">Queue</h1>
      <p className="text-sm text-muted-foreground">
        {isPending ? (
          "Loading cases…"
        ) : (
          <>
            <span className="font-numeric">{showing}</span>
            {" of "}
            <span className="font-numeric">{total}</span>
            {` ${total === 1 ? "case" : "cases"} · sorted by ${sort.replace("_", " ")}`}
          </>
        )}
      </p>
    </div>
  );
}
