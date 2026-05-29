/**
 * Case assignment dropdown — Phase 7.6 U3.
 *
 * Admin: pick any team member (or unassign).
 * Reviewer: claim if unassigned; unclaim if currently theirs.
 * Disabled otherwise.
 */
import { useId, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { sessionQueryOptions } from "@/lib/auth-client.ts";
import { useTeamMembers } from "@/hooks/use-team.ts";
import { useAssignCase } from "@/hooks/use-assign-case.ts";
import { cn } from "@/lib/utils.ts";

interface CaseAssignmentProps {
  readonly caseId: string;
  readonly currentAssignee: string | null;
}

const UNASSIGNED_VALUE = "__unassigned__";

function deriveOptionDisabled(
  role: "reviewer" | "admin",
  currentAssignee: string | null,
  optionUserId: string | null,
  viewerId: string,
): boolean {
  if (role === "admin") return false;
  if (optionUserId === null) return currentAssignee !== viewerId;
  return optionUserId === viewerId && currentAssignee === null;
}

function AssigneeSelect({
  selectId,
  disabled,
  value,
  options,
  onAssign,
}: {
  readonly selectId: string;
  readonly disabled: boolean;
  readonly value: string;
  readonly options: readonly { id: string; label: string; disabled: boolean }[];
  readonly onAssign: (userId: string | null) => void;
}): React.JSX.Element {
  return (
    <select
      id={selectId}
      disabled={disabled}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        onAssign(next === UNASSIGNED_VALUE ? null : next);
      }}
      className={cn(
        "min-w-[200px] rounded-md border border-border/60 bg-card px-2 py-1 text-sm shadow-elev-1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <option value={UNASSIGNED_VALUE}>Unassigned</option>
      {options.map((option) => (
        <option key={option.id} value={option.id} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function CaseAssignment({
  currentAssignee,
  caseId,
}: CaseAssignmentProps): React.JSX.Element {
  const selectId = useId();
  const session = useQuery(sessionQueryOptions());
  const viewer = session.data?.user;
  const members = useTeamMembers();
  const mutation = useAssignCase();
  const memberList = useMemo(() => members.data?.members ?? [], [members.data]);
  if (!viewer) return <span className="text-xs text-muted-foreground">Sign in to assign</span>;
  const role = viewer.role === "admin" ? "admin" : "reviewer";
  const allowed = role === "admin" || currentAssignee === null || currentAssignee === viewer.id;
  const options = memberList.map((member) => ({
    id: member.id,
    label: `${member.name} · ${member.role}`,
    disabled: deriveOptionDisabled(role, currentAssignee, member.id, viewer.id),
  }));
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={selectId}
        className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
      >
        <UserPlus className="mr-1 inline size-3" />
        Assigned to
      </label>
      <AssigneeSelect
        selectId={selectId}
        disabled={!allowed || mutation.isPending}
        value={currentAssignee ?? UNASSIGNED_VALUE}
        options={options}
        onAssign={(userId) => mutation.mutate({ caseId, userId })}
      />
    </div>
  );
}
