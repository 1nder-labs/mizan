import { z } from "zod";

/** Shared contracts for the team-management surface — Phase 7.6 U4. */

export const TeamRoleEnum = z.enum(["reviewer", "admin"]);
export type TeamRole = z.infer<typeof TeamRoleEnum>;

export const TeamMemberSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    role: TeamRoleEnum,
    createdAt: z.number().int(),
  })
  .strict();

export const TeamMembersResponseSchema = z
  .object({
    members: z.array(TeamMemberSchema),
  })
  .strict();

export const TeamInvitationSchema = z
  .object({
    id: z.string(),
    token: z.string().min(1),
    email: z.string().email(),
    role: TeamRoleEnum,
    invitedBy: z.string(),
    acceptedAt: z.number().int().nullable(),
    acceptedBy: z.string().nullable(),
    expiresAt: z.number().int(),
    createdAt: z.number().int(),
  })
  .strict();

export const TeamInvitationsResponseSchema = z
  .object({
    invitations: z.array(TeamInvitationSchema),
  })
  .strict();

export const CreateInvitationRequestSchema = z
  .object({
    email: z.string().email(),
    role: TeamRoleEnum,
    ttlHours: z.number().int().min(1).max(168),
  })
  .strict();

export const CreateInvitationResponseSchema = z
  .object({
    invitation: TeamInvitationSchema,
    inviteUrl: z.string().url(),
  })
  .strict();

/** Public lookup of an invitation by token — used by the accept page. */
export const InvitationLookupResponseSchema = z
  .object({
    email: z.string().email(),
    role: TeamRoleEnum,
    expiresAt: z.number().int(),
    accepted: z.boolean(),
    inviterName: z.string(),
  })
  .strict();

export const InvitationAcceptRequestSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

export const InvitationAcceptResponseSchema = z
  .object({
    role: TeamRoleEnum,
    redirectTo: z.string(),
  })
  .strict();

export const TeamErrorCodeEnum = z.enum([
  "invitation_not_found",
  "invitation_expired",
  "invitation_already_accepted",
  "email_mismatch",
  "unauthorized",
  "forbidden",
  "duplicate_email",
  "user_not_found",
]);

export const TeamErrorBodySchema = z.object({ error: TeamErrorCodeEnum }).strict();

export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type TeamMembersResponse = z.infer<typeof TeamMembersResponseSchema>;
export type TeamInvitation = z.infer<typeof TeamInvitationSchema>;
export type TeamInvitationsResponse = z.infer<typeof TeamInvitationsResponseSchema>;
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;
export type CreateInvitationResponse = z.infer<typeof CreateInvitationResponseSchema>;
export type InvitationLookupResponse = z.infer<typeof InvitationLookupResponseSchema>;
export type InvitationAcceptRequest = z.infer<typeof InvitationAcceptRequestSchema>;
export type InvitationAcceptResponse = z.infer<typeof InvitationAcceptResponseSchema>;
export type TeamErrorCode = z.infer<typeof TeamErrorCodeEnum>;
export type TeamErrorBody = z.infer<typeof TeamErrorBodySchema>;
