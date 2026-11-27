import { ROLE_HINT, ROLE_LABEL, type OrgRole } from "../shared/roles";
import { ChoiceField, type ChoiceOption } from "./form/choice-field";

// Owners are offered only to owners, so the picker never shows a role the actor cannot grant.
function roleOptions(canGrantOwner: boolean): ChoiceOption[] {
  return (Object.keys(ROLE_LABEL) as OrgRole[])
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
  value: OrgRole;
  onChange: (role: OrgRole) => void;
  canGrantOwner: boolean;
  autoFocus?: boolean;
}) {
  return <ChoiceField id={id} label="Role" value={value} onChange={(v) => onChange(v as OrgRole)} options={roleOptions(canGrantOwner)} describe={false} hint={ROLE_HINT[value]} autoFocus={autoFocus} />;
}
