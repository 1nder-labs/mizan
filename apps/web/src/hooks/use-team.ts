/**
 * Phase 7.6 — team management hooks. All API calls flow through
 * `api`/`apiMutate` so the AppType contract enforces drift detection.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  CreateInvitationResponseSchema,
  InvitationLookupResponseSchema,
  TeamErrorBodySchema,
  TeamInvitationsResponseSchema,
  TeamMembersResponseSchema,
  type CreateInvitationRequest,
  type CreateInvitationResponse,
  type InvitationLookupResponse,
  type TeamErrorCode,
  type TeamInvitationsResponse,
  type TeamMembersResponse,
} from "@mizan/shared";
import { api, apiMutate } from "@/lib/rpc.ts";
import { assertAuthorized } from "@/lib/cases-api.ts";

export class TeamApiError extends Error {
  readonly code: TeamErrorCode;
  readonly status: number;
  constructor(code: TeamErrorCode, status: number) {
    super(code);
    this.name = "TeamApiError";
    this.code = code;
    this.status = status;
  }
}

async function readTeamError(res: {
  readonly status: number;
  json(): Promise<unknown>;
}): Promise<TeamApiError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = TeamErrorBodySchema.safeParse(body);
  return new TeamApiError(parsed.success ? parsed.data.error : "forbidden", res.status);
}

async function fetchMembers(): Promise<TeamMembersResponse> {
  const res = await api.team.members.$get();
  assertAuthorized(res.status);
  if (!res.ok) throw await readTeamError(res);
  return TeamMembersResponseSchema.parse(await res.json());
}

export function useTeamMembers(): UseQueryResult<TeamMembersResponse, Error> {
  return useQuery<TeamMembersResponse, Error>({
    queryKey: ["team", "members"],
    queryFn: fetchMembers,
    staleTime: 60_000,
  });
}

async function fetchInvitations(): Promise<TeamInvitationsResponse> {
  const res = await api.team.invitations.$get();
  assertAuthorized(res.status);
  if (!res.ok) throw await readTeamError(res);
  return TeamInvitationsResponseSchema.parse(await res.json());
}

export function useTeamInvitations(enabled = true): UseQueryResult<TeamInvitationsResponse, Error> {
  return useQuery<TeamInvitationsResponse, Error>({
    queryKey: ["team", "invitations"],
    queryFn: fetchInvitations,
    enabled,
    staleTime: 30_000,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useMutation<CreateInvitationResponse, Error, CreateInvitationRequest>({
    mutationFn: async (body) => {
      const res = await apiMutate.team.invitations.$post({ json: body });
      assertAuthorized(res.status);
      if (!res.ok) throw await readTeamError(res);
      return CreateInvitationResponseSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team", "invitations"] });
    },
  });
}

export async function fetchInvitationLookup(token: string): Promise<InvitationLookupResponse> {
  const res = await api.team.invitations[":token"].$get({ param: { token } });
  if (!res.ok) throw await readTeamError(res);
  return InvitationLookupResponseSchema.parse(await res.json());
}

export function useInvitationLookup(
  token: string,
): UseQueryResult<InvitationLookupResponse, Error> {
  return useQuery<InvitationLookupResponse, Error>({
    queryKey: ["team", "invitation-lookup", token],
    queryFn: () => fetchInvitationLookup(token),
    retry: 0,
  });
}
