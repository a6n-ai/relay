import { baseStatement, createAccessControl } from "@foundry/auth";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...baseStatement,
  tenant: ["read", "write"],
  message: ["read", "write"],
  sending: ["read", "write"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  admin: ac.newRole({
    user: ["create", "set-role"],
    session: ["list", "revoke", "delete"],
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

export const ROLE_LABELS: Record<keyof typeof orgRoles, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Everything, including who owns the workspace" },
  admin: { label: "Admin", description: "Everything except changing owners" },
  member: { label: "Member", description: "Read everything, read and send mail" },
  billing: { label: "Billing", description: "Usage, limits and send history" },
};

export const PERMISSION_LABELS: { resource: string; label: string; actions: { action: string; label: string }[] }[] = [
  { resource: "tenant", label: "Apps", actions: [{ action: "read", label: "View" }, { action: "write", label: "Create and edit" }] },
  { resource: "sending", label: "Email sending", actions: [{ action: "read", label: "View" }, { action: "write", label: "Change" }] },
  { resource: "mailbox", label: "Mailbox", actions: [{ action: "read", label: "View" }, { action: "send", label: "Send mail" }, { action: "manage", label: "Manage" }] },
  { resource: "campaign", label: "Campaigns", actions: [{ action: "read", label: "View" }, { action: "write", label: "Create and edit" }, { action: "send", label: "Send" }] },
  { resource: "list", label: "People lists", actions: [{ action: "read", label: "View" }, { action: "write", label: "Create and edit" }, { action: "import", label: "Import" }] },
  { resource: "template", label: "Templates", actions: [{ action: "read", label: "View" }, { action: "write", label: "Create and edit" }] },
  { resource: "webhook", label: "Webhooks", actions: [{ action: "read", label: "View" }, { action: "write", label: "Create and edit" }] },
  { resource: "log", label: "Send history", actions: [{ action: "read", label: "View" }] },
  { resource: "settings", label: "Settings", actions: [{ action: "read", label: "View" }, { action: "write", label: "Change" }] },
  { resource: "workspace", label: "Workspace", actions: [{ action: "usage", label: "See usage" }, { action: "limits", label: "Change limits" }] },
  { resource: "staff", label: "Staff", actions: [{ action: "read", label: "View" }] },
  { resource: "invitation", label: "Invitations", actions: [{ action: "create", label: "Invite" }, { action: "cancel", label: "Cancel" }] },
  { resource: "member", label: "Members", actions: [{ action: "create", label: "Add" }, { action: "update", label: "Change role" }, { action: "delete", label: "Remove" }] },
  { resource: "team", label: "Teams", actions: [{ action: "create", label: "Create" }, { action: "update", label: "Edit" }, { action: "delete", label: "Delete" }] },
];
