import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc as platformAdminAc,
  defaultStatements as adminStatements,
} from "better-auth/plugins/admin/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

// Relay's platform resources; the super admin holds all of them.
const platformStatement = {
  settings: ["read", "write"],
  audit: ["read"],
  tenant: ["read", "write"],
  message: ["read", "write"],
  sending: ["read", "write"],
  domain: ["delete_protected"],
} as const;

export const statement = { ...adminStatements, ...platformStatement } as const;

export const ac = createAccessControl(statement);

export const roles = {
  // Platform admin: better-auth's full admin set (ban, impersonate, list) plus Relay's resources.
  admin: ac.newRole({ ...platformAdminAc.statements, ...platformStatement }),
  // Held by every other user. The admin plugin checks a role name against this map, so it must exist even though it grants nothing.
  user: ac.newRole({}),
};

export const appStatement = {
  tenant: ["read", "write"],
  sending: ["read", "write"],
  mailbox: ["read", "send", "manage"],
  campaign: ["read", "write", "send"],
  list: ["read", "write", "import"],
  template: ["read", "write"],
  webhook: ["read", "write", "log_all"],
  log: ["read"],
  settings: ["read", "write"],
  workspace: ["usage", "limits"],
  staff: ["read"],
} as const;
const orgStatement = { ...defaultStatements, ...appStatement };
export const orgAc = createAccessControl(orgStatement);
export const orgRoles = {
  owner: orgAc.newRole({ ...ownerAc.statements, ...appStatement }),
  admin: orgAc.newRole({ ...adminAc.statements, ...appStatement }),
  member: orgAc.newRole({
    ...memberAc.statements,
    mailbox: ["read", "send"],
    tenant: ["read"],
    sending: ["read"],
    campaign: ["read"],
    list: ["read"],
    template: ["read"],
    webhook: ["read"],
    settings: ["read"],
    log: ["read"],
    staff: ["read"],
  }),
  billing: orgAc.newRole({
    workspace: ["usage", "limits"],
    log: ["read"],
    tenant: ["read"],
  }),
};

// Server guards and the client nav both use this, so a hidden link always matches a refused load.
export const allows = (roles: (keyof typeof orgRoles)[], need: Record<string, string[]>): boolean =>
  roles.some((r) => orgRoles[r].authorize(need).success);
