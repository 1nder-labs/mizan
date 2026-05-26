/**
 * Single case card on the Kanban board. Sortable via `useSortable`.
 *
 * Navigation is programmatic and drag-aware. dnd-kit's pointerdown
 * listener is preserved (chained, not overridden) so the sortable
 * activation constraint can register the drag, while a wrapping
 * handler captures the start coordinates. The click handler routes
 * to case-detail only when the pointer moved less than the activation
 * threshold AND `useSortable.isDragging` is false. Previous Link
 * wrapper hijacked pointerup → snapped drops back to origin column.
 */
import { useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import type { CaseRow } from "@mizan/shared";
import { CaseStatusBadge } from "@/components/case-status-badge.tsx";
import { RecommendationBadge } from "@/components/case/recommendation-badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { formatMediumDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

const CLICK_DRIFT_THRESHOLD_PX = 5;

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
        <CaseStatusBadge status={row.status} />
      </div>
      <div className="space-y-0.5">
        <p className="text-[15px] font-semibold capitalize leading-tight tracking-tight text-foreground">
          {row.category}
        </p>
        <p className="text-xs text-muted-foreground">{row.geography}</p>
      </div>
      {row.latest_brief ? (
        <div className="flex items-center gap-2 border-t border-border/40 pt-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            AI rec
          </span>
          <RecommendationBadge recommendation={row.latest_brief.recommendation} />
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground/80 tabular">
        {formatMediumDateTime(row.updated_at)}
      </p>
    </div>
  );
}

export function KanbanCard({ row, dragging }: KanbanCardProps): React.JSX.Element {
  const navigate = useNavigate();
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { status: row.status },
  });
  const { onPointerDown: dndPointerDown, ...restListeners } = listeners ?? {};
  const handlePointerDown = (event: React.PointerEvent<HTMLLIElement>): void => {
    downAt.current = { x: event.clientX, y: event.clientY };
    dndPointerDown?.(event);
  };
  const handleClick = (event: React.MouseEvent<HTMLLIElement>): void => {
    if (isDragging) return;
    const start = downAt.current;
    if (!start) return;
    const dx = Math.abs(event.clientX - start.x);
    const dy = Math.abs(event.clientY - start.y);
    if (dx > CLICK_DRIFT_THRESHOLD_PX || dy > CLICK_DRIFT_THRESHOLD_PX) return;
    void navigate({ to: "/case/$caseId", params: { caseId: row.id } });
  };
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...restListeners}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={cn(
        "list-none cursor-grab focus:outline-none active:cursor-grabbing",
        (isDragging ?? dragging) ? "opacity-40" : "opacity-100",
      )}
    >
      <Card
        className={cn(
          "lift-on-hover border-border/50 bg-card/90 p-3 shadow-elev-1",
          "hover:border-foreground/30 hover:shadow-elev-2",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <KanbanCardBody row={row} />
      </Card>
    </li>
  );
}
