import { ChoiceField, type ChoiceOption } from "./form/choice-field";

export type MemberRole = "owner" | "admin" | "member" | "billing";

export const ROLE_LABEL: Record<MemberRole, string> = { owner: "Owner", admin: "Admin", member: "Member", billing: "Billing" };

const ROLE_HINT: Record<MemberRole, string> = {
  owner: "Full access, including ownership of the workspace.",
  admin: "Manage apps, sending, members and settings.",
  member: "View apps and campaigns, and use the mailbox.",
  billing: "View usage and limits.",
};

// Owners are offered only to owners, so the picker never shows a role the actor cannot grant.
export function roleOptions(canGrantOwner: boolean): ChoiceOption[] {
  return (Object.keys(ROLE_LABEL) as MemberRole[])
    .filter((r) => r !== "owner" || canGrantOwner)
    .map((r) => ({ value: r, label: ROLE_LABEL[r], description: ROLE_HINT[r] }));
}

export function RoleChoice({
  id,
  value,
  onChange,
  canGrantOwner,
  autoFocus,
}: {
  id: string;
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  canGrantOwner: boolean;
  autoFocus?: boolean;
}) {
  return <ChoiceField id={id} label="Role" value={value} onChange={(v) => onChange(v as MemberRole)} options={roleOptions(canGrantOwner)} describe={false} hint={ROLE_HINT[value]} autoFocus={autoFocus} />;
}
