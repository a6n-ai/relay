import { createAccessControl } from "better-auth/plugins/access";
import { adminAc as platformAdminAc, defaultStatements as adminStatements } from "better-auth/plugins/admin/access";
import { ORG_PERMISSIONS, PLATFORM_PERMISSIONS } from "../shared/permissions";
import { ORG_ROLES, type OrgRole } from "../shared/roles";

export const statement = { ...adminStatements, ...PLATFORM_PERMISSIONS } as const;

export const ac = createAccessControl(statement);

export const roles = {
  // Platform admin: better-auth's full admin set (ban, impersonate, list) plus Relay's resources.
  admin: ac.newRole({ ...platformAdminAc.statements, ...PLATFORM_PERMISSIONS }),
  // Held by every other user. The admin plugin checks a role name against this map, so it must exist even though it grants nothing.
  user: ac.newRole({}),
};

const entries = Object.entries(ORG_PERMISSIONS) as [string, Record<string, readonly OrgRole[]>][];
const orgStatement = Object.fromEntries(entries.map(([resource, actions]) => [resource, Object.keys(actions)]));
export const orgAc = createAccessControl(orgStatement);

const roleStatements = (role: OrgRole) =>
  Object.fromEntries(
    entries
      .map(([resource, actions]) => [resource, Object.keys(actions).filter((a) => actions[a]?.includes(role))] as const)
      .filter(([, granted]) => granted.length > 0),
  );

export const orgRoles = Object.fromEntries(ORG_ROLES.map((r) => [r, orgAc.newRole(roleStatements(r))])) as Record<
  OrgRole,
  ReturnType<typeof orgAc.newRole>
>;
