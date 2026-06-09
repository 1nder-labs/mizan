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
import { meQueryOptions } from "@/lib/me-api.ts";
import { useTeamMembers } from "@/hooks/use-team.ts";
import { useAssignCase } from "@/hooks/use-assign-case.ts";
import { cn } from "@/lib/utils.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { deriveOptionDisabled } from "./case-assignment-policy.ts";

interface CaseAssignmentProps {
  readonly caseId: string;
  readonly currentAssignee: string | null;
}

const UNASSIGNED_VALUE = "__unassigned__";

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
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onAssign(next === UNASSIGNED_VALUE ? null : next)}
    >
      <SelectTrigger id={selectId} className="min-w-[200px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CaseAssignment({
  currentAssignee,
  caseId,
}: CaseAssignmentProps): React.JSX.Element {
  const selectId = useId();
  const me = useQuery(meQueryOptions());
  const viewer = me.data?.user;
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
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={selectId}
        className={cn(
          "flex items-center gap-1 text-[10px] font-medium",
          "uppercase tracking-[0.18em] text-muted-foreground",
        )}
      >
        <UserPlus className="size-3" />
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
