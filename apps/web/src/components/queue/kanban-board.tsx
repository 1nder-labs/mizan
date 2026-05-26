/**
 * Kanban board — stakeholder-facing pipeline view. Mirrors the
 * `@dnd-kit` pattern proven in noro-cortex.
 *
 * Five primary columns + read-only display columns for workflow-owned
 * statuses. `DRAFT → QUEUED` fires immediately via the mutation hook;
 * `SUSPENDED_HITL → ACTIONED` opens the action modal so rationale +
 * idempotency stay aligned with the inline action panel.
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import {
  canReviewerTransition,
  isCaseStatus,
  type CaseRow,
  type CaseStatus,
  type QueueSearch,
} from "@mizan/shared";
import { Card } from "@/components/ui/card.tsx";
import { useCaseStatusMutation } from "@/hooks/use-case-status-mutation.ts";
import { COPY, statusDisplay } from "@/lib/copy-constants.ts";
import { KanbanCardBody } from "./kanban-card.tsx";
import { KanbanColumn, type KanbanColumnSpec } from "./kanban-column.tsx";
import { KanbanActionModal } from "./kanban-action-modal.tsx";

interface KanbanBoardProps {
  readonly rows: readonly CaseRow[];
  readonly search: QueueSearch;
}

const COLUMN_SPECS: readonly KanbanColumnSpec[] = [
  { status: "DRAFT", readOnly: false },
  { status: "QUEUED", readOnly: true },
  { status: "RUNNING", readOnly: true },
  { status: "SUSPENDED_HITL", readOnly: false },
  { status: "READY_FOR_REVIEW", readOnly: true },
  { status: "ACTIONED", readOnly: false },
  { status: "FAILED", readOnly: true },
];

function emptyGroups(): Record<CaseStatus, CaseRow[]> {
  const groups: Record<CaseStatus, CaseRow[]> = {
    DRAFT: [],
    QUEUED: [],
    RUNNING: [],
    SUSPENDED_HITL: [],
    READY_FOR_REVIEW: [],
    ACTIONED: [],
    FAILED: [],
  };
  return groups;
}

function groupRowsByStatus(rows: readonly CaseRow[]): Readonly<Record<CaseStatus, CaseRow[]>> {
  const groups = emptyGroups();
  for (const row of rows) groups[row.status].push(row);
  return groups;
}

function readStatusFromRecord(data: Record<string, unknown> | undefined, field: string): CaseStatus | undefined {
  if (!data) return undefined;
  const candidate = data[field];
  return typeof candidate === "string" && isCaseStatus(candidate) ? candidate : undefined;
}

function deriveTargetStatus(event: DragEndEvent, rows: readonly CaseRow[]): CaseStatus | null {
  const { over } = event;
  if (!over) return null;
  const overId = String(over.id);
  if (overId.startsWith("column-")) {
    return readStatusFromRecord(over.data.current, "columnStatus") ?? null;
  }
  const target = rows.find((row) => row.id === overId);
  return target ? target.status : null;
}

interface PendingAction {
  readonly caseId: string;
  readonly actionId: string;
}

function useBoardSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function BoardColumns({
  groups,
  activeStatus,
  activeId,
}: {
  readonly groups: Readonly<Record<CaseStatus, CaseRow[]>>;
  readonly activeStatus: CaseStatus | null;
  readonly activeId: string | null;
}): React.JSX.Element {
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-6">
      <div className="inline-flex gap-3">
        {COLUMN_SPECS.map((spec, index) => (
          <div
            key={spec.status}
            className="animate-rise"
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <KanbanColumn
              spec={spec}
              rows={groups[spec.status] ?? []}
              activeStatus={activeStatus}
              activeId={activeId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardOverlay({ activeRow }: { readonly activeRow: CaseRow | null }): React.JSX.Element {
  return createPortal(
    <DragOverlay dropAnimation={null}>
      {activeRow ? (
        <Card
          className="w-[264px] border-foreground/50 bg-card/95 p-3 shadow-elev-2 ring-1 ring-foreground/10"
          style={{ transform: "rotate(-2deg) scale(1.02)" }}
        >
          <KanbanCardBody row={activeRow} />
        </Card>
      ) : null}
    </DragOverlay>,
    document.body,
  );
}

function handleDragResult(
  event: DragEndEvent,
  rows: readonly CaseRow[],
  search: QueueSearch,
  callbacks: {
    readonly mutate: ReturnType<typeof useCaseStatusMutation>["mutate"];
    readonly setPendingAction: (pending: PendingAction) => void;
  },
): void {
  const sourceStatus = readStatusFromRecord(event.active.data.current, "status");
  const targetStatus = deriveTargetStatus(event, rows);
  if (!sourceStatus || !targetStatus || sourceStatus === targetStatus) return;
  if (!canReviewerTransition(sourceStatus, targetStatus)) {
    toast.error(COPY.queue.transitionDenied(statusDisplay(sourceStatus), statusDisplay(targetStatus)));
    return;
  }
  const caseId = String(event.active.id);
  if (sourceStatus === "SUSPENDED_HITL" && targetStatus === "ACTIONED") {
    callbacks.setPendingAction({ caseId, actionId: crypto.randomUUID() });
    return;
  }
  callbacks.mutate({ caseId, targetStatus, search });
}

export function KanbanBoard({ rows, search }: KanbanBoardProps): React.JSX.Element {
  const mutation = useCaseStatusMutation();
  const groups = useMemo(() => groupRowsByStatus(rows), [rows]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const sensors = useBoardSensors();
  const activeRow = activeId ? rows.find((row) => row.id === activeId) ?? null : null;
  const onDragStart = (event: DragStartEvent): void => setActiveId(String(event.active.id));
  const onDragEnd = (event: DragEndEvent): void => {
    setActiveId(null);
    handleDragResult(event, rows, search, { mutate: mutation.mutate, setPendingAction });
  };
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <BoardColumns groups={groups} activeStatus={activeRow?.status ?? null} activeId={activeId} />
      <BoardOverlay activeRow={activeRow} />
      <KanbanActionModal
        caseId={pendingAction?.caseId ?? null}
        actionId={pendingAction?.actionId ?? null}
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      />
    </DndContext>
  );
}
