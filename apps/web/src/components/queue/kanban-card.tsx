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
import { Clock, ContactRound } from "lucide-react";
import type { CaseRow } from "@mizan/shared";
import { CaseStatusBadge } from "@/components/case-status-badge.tsx";
import { RecommendationBadge } from "@/components/case/recommendation-badge.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { useTeamMembers } from "@/hooks/use-team.ts";
import { formatMediumDateTime } from "@/lib/format.ts";
import { formatCountry } from "@/lib/display-labels.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";

const CLICK_DRIFT_THRESHOLD_PX = 5;

interface KanbanCardProps {
  readonly row: CaseRow;
  readonly dragging?: boolean;
}

/** Resolves an assignee user-id to a display name via the shared team query. */
function useAssigneeName(assignedTo: string | null): string | null {
  const members = useTeamMembers();
  if (!assignedTo) return null;
  const match = (members.data?.members ?? []).find((member) => member.id === assignedTo);
  return match?.name ?? null;
}

/** One icon + text line in the card footer. */
function MetaLine({
  icon: Icon,
  children,
  muted,
}: {
  readonly icon: typeof Clock;
  readonly children: React.ReactNode;
  readonly muted?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px]",
        muted ? "text-muted-foreground/80" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3 shrink-0 text-muted-foreground/60" />
      <span className="truncate">{children}</span>
    </div>
  );
}

/** Footer: AI recommendation, assignee (when set), and the last-updated stamp. */
function CardMeta({
  row,
  assigneeName,
}: {
  readonly row: CaseRow;
  readonly assigneeName: string | null;
}): React.JSX.Element {
  return (
    <div className="space-y-2 border-t border-border/40 pt-2.5">
      {row.latest_brief ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            AI rec
          </span>
          <RecommendationBadge recommendation={row.latest_brief.recommendation} />
        </div>
      ) : null}
      {row.assigned_to ? (
        <MetaLine icon={ContactRound}>
          Assigned to{" "}
          <span className="font-medium text-foreground/80">{assigneeName ?? "a reviewer"}</span>
        </MetaLine>
      ) : null}
      <MetaLine icon={Clock} muted>
        <span className="font-numeric tabular">{formatMediumDateTime(row.updated_at)}</span>
      </MetaLine>
    </div>
  );
}

export function KanbanCardBody({ row }: { readonly row: CaseRow }): React.JSX.Element {
  const assigneeName = useAssigneeName(row.assigned_to);
  return (
    <div className="space-y-2.5">
      <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
        {row.title}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.client_submitted ? (
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium leading-none tracking-wide",
              "bg-status-info text-status-info-foreground border-status-info-border",
            )}
          >
            {COPY.reviewerNotes.clientSubmittedShort}
          </Badge>
        ) : null}
        <CaseStatusBadge status={row.status} />
      </div>
      <p className="text-xs capitalize text-muted-foreground">
        {row.category} · {formatCountry(row.geography)}
      </p>
      <CardMeta row={row} assigneeName={assigneeName} />
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
