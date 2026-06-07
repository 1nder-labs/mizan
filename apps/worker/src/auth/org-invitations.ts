/**
 * Minimal structural shape of a better-auth instance. Avoids referencing the
 * full `ReturnType<typeof createAuth>` here, which would create a type cycle
 * (createAuth wires databaseHooks that depend on this accessor).
 */
export interface AuthLike {
  readonly api: unknown;
}

interface InvitationRecord {
  id: string;
  email: string;
  role: string;
  inviterId: string;
  expiresAt: Date;
  createdAt: Date;
  status: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readDate(record: Record<string, unknown>, key: string): Date | null {
  const value = record[key];
  return value instanceof Date ? value : null;
}

function parseInvitationRecord(value: unknown): InvitationRecord {
  if (!isRecord(value)) throw new Error("invalid invitation payload");
  const id = readString(value, "id");
  const email = readString(value, "email");
  const role = readString(value, "role");
  const inviterId = readString(value, "inviterId");
  const status = readString(value, "status");
  const expiresAt = readDate(value, "expiresAt");
  const createdAt = readDate(value, "createdAt");
  if (!id || !email || !role || !inviterId || !status || !expiresAt || !createdAt) {
    throw new Error("invitation payload missing required fields");
  }
  return { id, email, role, inviterId, status, expiresAt, createdAt };
}

type AuthApiFn = (input: Record<string, unknown>) => Promise<unknown>;

interface OrganizationInvitationApi {
  listInvitations: AuthApiFn;
  createInvitation: AuthApiFn;
  getInvitation: AuthApiFn;
  acceptInvitation: AuthApiFn;
  createOrganization: AuthApiFn;
  addMember: AuthApiFn;
  setActiveOrganization: AuthApiFn;
}

function readApiFn(api: Record<string, unknown>, key: string): AuthApiFn {
  const value = api[key];
  if (typeof value !== "function") {
    throw new Error(`organization plugin missing auth.api.${key}`);
  }
  return (input: Record<string, unknown>) => Promise.resolve(value(input));
}

/** Resolves organization invitation endpoints from a configured auth instance. */
export function getOrganizationInvitationApi(auth: AuthLike): OrganizationInvitationApi {
  if (!isRecord(auth.api)) throw new Error("auth.api missing");
  return {
    listInvitations: readApiFn(auth.api, "listInvitations"),
    createInvitation: readApiFn(auth.api, "createInvitation"),
    getInvitation: readApiFn(auth.api, "getInvitation"),
    acceptInvitation: readApiFn(auth.api, "acceptInvitation"),
    createOrganization: readApiFn(auth.api, "createOrganization"),
    addMember: readApiFn(auth.api, "addMember"),
    setActiveOrganization: readApiFn(auth.api, "setActiveOrganization"),
  };
}

/** Parses a better-auth invitation API payload into a stable record shape. */
export function parseOrganizationInvitation(value: unknown): InvitationRecord {
  return parseInvitationRecord(value);
}

export type { InvitationRecord };
