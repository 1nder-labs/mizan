/**
 * Organization access control. Mizan uses two custom roles — `admin` and
 * `reviewer` — instead of better-auth's default `owner`/`admin`/`member`, so
 * the access controller and role set are declared explicitly and passed to the
 * organization plugin. Without this, invitations for role `reviewer` fail with
 * `ROLE_NOT_FOUND`.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc } from "better-auth/plugins/organization/access";

const accessControl = createAccessControl({ ...defaultStatements });

const adminRole = accessControl.newRole({ ...adminAc.statements });
const reviewerRole = accessControl.newRole({ ...memberAc.statements });

export const orgAccessControl = accessControl;
export const orgRoles = { admin: adminRole, reviewer: reviewerRole } as const;
