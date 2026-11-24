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

export const statement = {
  ...adminStatements,
  settings: ["read", "write"],
  audit: ["read"],
  tenant: ["read", "write"],
  message: ["read", "write"],
  sending: ["read", "write"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  // Platform admin: better-auth's full admin set (ban, impersonate, list) plus Relay's resources.
  admin: ac.newRole({
    ...platformAdminAc.statements,
    settings: ["read", "write"],
    audit: ["read"],
    tenant: ["read", "write"],
    message: ["read", "write"],
    sending: ["read", "write"],
  }),
  user: ac.newRole({}),
};

export const appStatement = {
  tenant: ["read", "write"],
  sending: ["read", "write"],
  mailbox: ["read", "send", "manage"],
  campaign: ["read", "write", "send"],
  list: ["read", "write", "import"],
  template: ["read", "write"],
  webhook: ["read", "write"],
  log: ["read"],
  settings: ["read", "write"],
  workspace: ["usage", "limits"],
  staff: ["read"],
} as const;
export const orgStatement = { ...defaultStatements, ...appStatement };
export const orgAc = createAccessControl(orgStatement);
const allApp = appStatement;
export const orgRoles = {
  owner: orgAc.newRole({ ...ownerAc.statements, ...allApp }),
  admin: orgAc.newRole({ ...adminAc.statements, ...allApp }),
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
