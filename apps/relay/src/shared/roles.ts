export const ORG_ROLES = ["owner", "admin", "member", "billing"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ROLE_LABEL: Record<OrgRole, string> = { owner: "Owner", admin: "Admin", member: "Member", billing: "Billing" };

export const ROLE_HINT: Record<OrgRole, string> = {
  owner: "Full access, including ownership of the workspace.",
  admin: "Manage apps, sending, members and settings.",
  member: "View apps and campaigns, and use the mailbox.",
  billing: "View usage and limits.",
};
