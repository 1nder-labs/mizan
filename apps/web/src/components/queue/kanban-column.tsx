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
  DRAFT: "bg-slate-400",
  QUEUED: "bg-sky-400",
  RUNNING: "bg-indigo-400",
  SUSPENDED_HITL: "bg-amber-400",
  READY_FOR_REVIEW: "bg-violet-400",
  ACTIONED: "bg-emerald-500",
  FAILED: "bg-rose-500",
};

const STATUS_RAIL: Readonly<Record<CaseStatus, string>> = {
  DRAFT: "from-slate-400/0 via-slate-400/40 to-slate-400/0",
  QUEUED: "from-sky-400/0 via-sky-400/40 to-sky-400/0",
  RUNNING: "from-indigo-400/0 via-indigo-400/40 to-indigo-400/0",
  SUSPENDED_HITL: "from-amber-400/0 via-amber-400/40 to-amber-400/0",
  READY_FOR_REVIEW: "from-violet-400/0 via-violet-400/40 to-violet-400/0",
  ACTIONED: "from-emerald-500/0 via-emerald-500/40 to-emerald-500/0",
  FAILED: "from-rose-500/0 via-rose-500/40 to-rose-500/0",
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
    <header className="relative flex items-center justify-between gap-2 border-b border-border/40 px-3 py-3">
      <div className="flex items-center gap-2">
        <span
          className={cn("size-2 rounded-full", STATUS_TONE[spec.status], showPulse && "pulse-dot")}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80">
          {statusDisplay(spec.status)}
        </span>
      </div>
      <span className="rounded-full bg-muted/50 px-2 text-[11px] font-mono text-muted-foreground tabular">
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

export function KanbanColumn({ spec, rows, activeStatus, activeId }: KanbanColumnProps): React.JSX.Element {
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
