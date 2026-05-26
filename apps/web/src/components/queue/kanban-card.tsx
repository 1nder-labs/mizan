/**
 * Single case card on the Kanban board. Sortable via `useSortable`.
 * Compact summary the reviewer scans: id tail, category, geography,
 * recommendation chip, updated timestamp.
 *
 * Aesthetic: refined editorial. Default state reads quietly; on
 * hover the card lifts subtly, the border accents, and the recommendation
 * chip pops. Dragging dims the originating row to ~40% so the
 * `<DragOverlay>` floats clearly above.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import type { CaseRow } from "@mizan/shared";
import { RecommendationBadge } from "@/components/case/recommendation-badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { formatMediumDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

interface KanbanCardProps {
  readonly row: CaseRow;
  readonly dragging?: boolean;
}

export function KanbanCardBody({ row }: { readonly row: CaseRow }): React.JSX.Element {
  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 tabular">
          {row.id.slice(0, 8)}
        </span>
        {row.latest_brief ? (
          <RecommendationBadge recommendation={row.latest_brief.recommendation} />
        ) : null}
      </div>
      <div className="space-y-0.5">
        <p className="text-[15px] font-semibold capitalize leading-tight tracking-tight text-foreground">
          {row.category}
        </p>
        <p className="text-xs text-muted-foreground">{row.geography}</p>
      </div>
      <p className="text-[11px] text-muted-foreground/80 tabular">{formatMediumDateTime(row.updated_at)}</p>
    </div>
  );
}

export function KanbanCard({ row, dragging }: KanbanCardProps): React.JSX.Element {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { status: row.status },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "list-none focus:outline-none",
        (isDragging ?? dragging) ? "opacity-40" : "opacity-100",
      )}
    >
      <Link to="/case/$caseId" params={{ caseId: row.id }} className="block">
        <Card
          className={cn(
            "lift-on-hover border-border/50 bg-card/90 p-3 shadow-elev-1",
            "hover:border-foreground/30 hover:shadow-elev-2",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          <KanbanCardBody row={row} />
        </Card>
      </Link>
    </li>
  );
}
