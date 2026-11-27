import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { changeRoleFn } from "../../console/members.fns";
import { errorText } from "../error-text";
import { FormActions, FormBody, FormError } from "../page/form-parts";
import { type MemberRole, RoleChoice } from "../role-select";

// Opened from a row menu, so the parent owns open state.
export function ChangeRoleDialog({
  member,
  canGrantOwner,
  onOpenChange,
}: {
  member: { id: string; name: string; role: MemberRole };
  canGrantOwner: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState<MemberRole>(member.role);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await changeRoleFn({ data: { memberId: member.id, role } });
      toast.success("Role updated", { description: member.name });
      onOpenChange(false);
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not change the role."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role for {member.name}</DialogTitle>
        </DialogHeader>
        <FormBody onSubmit={submit}>
          <RoleChoice id="change-role" value={role} onChange={setRole} canGrantOwner={canGrantOwner} autoFocus />
          <FormError message={error} />
          <FormActions cancel submitLabel="Save role" pending={pending} pendingLabel="Saving…" disabled={role === member.role} disabledReason="Pick a different role to save." />
        </FormBody>
      </DialogContent>
    </Dialog>
  );
}
