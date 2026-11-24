import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";

export type MemberRole = "owner" | "admin" | "member" | "billing";

export const ROLE_LABEL: Record<MemberRole, string> = { owner: "Owner", admin: "Admin", member: "Member", billing: "Billing" };

// Owners are offered only to owners, so the picker never shows a role the actor cannot grant.
export function RoleSelect({
  id,
  value,
  onChange,
  canGrantOwner,
}: {
  id: string;
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  canGrantOwner: boolean;
}) {
  const roles = (Object.keys(ROLE_LABEL) as MemberRole[]).filter((r) => r !== "owner" || canGrantOwner);
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MemberRole)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
