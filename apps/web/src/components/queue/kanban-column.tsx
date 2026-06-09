/**
 * One column on the Kanban board. Read-only columns disable drop and
 * dim slightly during an active drag. Valid drop targets glow on
 * hover; invalid targets stay quiet so the reviewer's eye doesn't
 * fragment.
 */
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { CaseRow, CaseStatus } from "@mizan/shared";
import { canReviewerTransition } from "@mizan/shared";
import { statusDisplay, COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";
import { KanbanCard } from "./kanban-card.tsx";
import { KanbanEmpty } from "./kanban-empty.tsx";

export interface KanbanColumnSpec {
  readonly status: CaseStatus;
  readonly readOnly: boolean;
}

interface KanbanColumnProps {
  readonly spec: KanbanColumnSpec;
  readonly rows: readonly CaseRow[];
  readonly activeStatus: CaseStatus | null;
  readonly activeId: string | null;
}

const STATUS_TONE: Readonly<Record<CaseStatus, string>> = {
  DRAFT: "bg-status-neutral-border",
  QUEUED: "bg-status-info",
  RUNNING: "bg-status-info-foreground",
  SUSPENDED_HITL: "bg-status-warning-border",
  ACTIONED: "bg-status-success-border",
  FAILED: "bg-status-destructive-border",
};

const STATUS_RAIL: Readonly<Record<CaseStatus, string>> = {
  DRAFT: "from-status-neutral/0 via-status-neutral/40 to-status-neutral/0",
  QUEUED: "from-status-info/0 via-status-info/40 to-status-info/0",
  RUNNING: "from-status-info/0 via-status-info/60 to-status-info/0",
  SUSPENDED_HITL: "from-status-warning/0 via-status-warning/40 to-status-warning/0",
  ACTIONED: "from-status-success/0 via-status-success/40 to-status-success/0",
  FAILED: "from-status-destructive/0 via-status-destructive/40 to-status-destructive/0",
};

function deriveIsValidTarget(activeStatus: CaseStatus | null, target: CaseStatus): boolean {
  if (!activeStatus) return false;
  return canReviewerTransition(activeStatus, target);
}

function ColumnHeader({
  spec,
  rows,
  showPulse,
}: {
  readonly spec: KanbanColumnSpec;
  readonly rows: readonly CaseRow[];
  readonly showPulse: boolean;
}): React.JSX.Element {
  return (
    <header className="relative flex items-center justify-between gap-2 border-b border-border/40 p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn("size-2 rounded-full", STATUS_TONE[spec.status], showPulse && "pulse-dot")}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80">
          {statusDisplay(spec.status)}
        </span>
      </div>
      <span className="font-numeric rounded-full bg-muted/50 px-2 text-[11px] text-muted-foreground">
        {rows.length}
      </span>
      <span
        className={cn(
          "pointer-events-none absolute inset-x-3 -bottom-px h-px bg-gradient-to-r",
          STATUS_RAIL[spec.status],
        )}
        aria-hidden
      />
    </header>
  );
}

export function KanbanColumn({
  spec,
  rows,
  activeStatus,
  activeId,
}: KanbanColumnProps): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${spec.status}`,
    data: { columnStatus: spec.status },
    disabled: spec.readOnly,
  });
  const isValidTarget = deriveIsValidTarget(activeStatus, spec.status);
  const showDropHighlight = isValidTarget && isOver;
  const tooltip = spec.readOnly ? COPY.queue.readOnlyColumnTooltip : undefined;
  return (
    <div
      ref={setNodeRef}
      title={tooltip}
      className={cn(
        "flex w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card/70 backdrop-blur-sm transition-all duration-300",
        spec.readOnly ? "border-border/20 bg-muted/15" : "border-border/40",
        activeStatus && isValidTarget && !isOver && "border-foreground/25",
        showDropHighlight && "border-foreground/60 bg-primary/[0.04] shadow-elev-2",
        spec.readOnly && activeStatus && "opacity-60",
      )}
    >
      <ColumnHeader spec={spec} rows={rows} showPulse={Boolean(activeStatus) && isValidTarget} />
      <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
        <ul
          className="board-canvas flex-1 space-y-2 overflow-y-auto p-2"
          style={{ maxHeight: "calc(100vh - 20rem)" }}
        >
          {rows.length === 0 ? (
            <KanbanEmpty />
          ) : (
            rows.map((row) => <KanbanCard key={row.id} row={row} dragging={row.id === activeId} />)
          )}
        </ul>
      </SortableContext>
    </div>
  );
}
