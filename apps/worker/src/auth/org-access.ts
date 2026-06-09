/**
 * Organization access control. Mizan uses three custom roles — `admin`,
 * `reviewer`, and `client` — instead of better-auth's default
 * `owner`/`admin`/`member`, so the access controller and role set are declared
 * explicitly and passed to the organization plugin. Without this, invitations
 * for role `reviewer` fail with `ROLE_NOT_FOUND`.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc } from "better-auth/plugins/organization/access";

const accessControl = createAccessControl({ ...defaultStatements });

const adminRole = accessControl.newRole({ ...adminAc.statements });
const reviewerRole = accessControl.newRole({ ...memberAc.statements });
/**
 * Clients hold NO org-plugin permissions: they reach their data only through
 * `/api/portal/*`, and `nativeOrgGuard` blocks them from the native
 * `/organization/*` endpoints. Every statement key is present with an empty
 * action set — least-privilege (grants nothing) while keeping the role's
 * `authorize` signature shape-compatible with `admin`/`reviewer` in `orgRoles`
 * (an empty `newRole({})` infers `K extends never` and breaks the role union).
 * This is a second layer behind the guard: a client who somehow reached a
 * permission-gated org operation still has nothing granted.
 */
const clientRole = accessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
});

export const orgAccessControl = accessControl;
export const orgRoles = { admin: adminRole, reviewer: reviewerRole, client: clientRole } as const;
