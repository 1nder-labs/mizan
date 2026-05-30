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
        <p className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
          {row.title}
        </p>
        <CaseStatusBadge status={row.status} />
      </div>
      <p className="text-xs capitalize text-muted-foreground">
        {row.category} · {row.geography}
      </p>
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

/**
 * Drag-aware click + keyboard navigation for a kanban card. Click navigates
 * only when the pointer barely moved (so a drag gesture never opens the case);
 * Enter/Space provide keyboard access. `downAt` is owned here and stamped by
 * the card's own pointer-down handler (which also forwards to dnd-kit).
 */
function useCardClick(caseId: string, isDragging: boolean) {
  const navigate = useNavigate();
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const goToCase = (): void => {
    void navigate({ to: "/case/$caseId", params: { caseId } });
  };
  return {
    downAt,
    onClick: (event: React.MouseEvent<HTMLLIElement>): void => {
      const start = downAt.current;
      if (isDragging || !start) return;
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dx > CLICK_DRIFT_THRESHOLD_PX || dy > CLICK_DRIFT_THRESHOLD_PX) return;
      goToCase();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLLIElement>): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goToCase();
      }
    },
  };
}

export function KanbanCard({ row, dragging }: KanbanCardProps): React.JSX.Element {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { status: row.status },
  });
  const { onPointerDown: dndPointerDown, ...restListeners } = listeners ?? {};
  const { role: _dndRole, tabIndex: _dndTabIndex, ...restAttributes } = attributes;
  const { downAt, onClick, onKeyDown } = useCardClick(row.id, isDragging);
  const handlePointerDown = (event: React.PointerEvent<HTMLLIElement>): void => {
    downAt.current = { x: event.clientX, y: event.clientY };
    dndPointerDown?.(event);
  };
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      role="button"
      tabIndex={0}
      {...restAttributes}
      {...restListeners}
      onPointerDown={handlePointerDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
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
