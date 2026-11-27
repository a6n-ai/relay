import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { changeRoleFn } from "../../console/members.fns";
import { FormActions, FormBody, FormError } from "../page/form-parts";
import { RoleChoice } from "./role-select";
import { type OrgRole } from "../../shared/roles";
import { useSubmit } from "../use-submit";

// Opened from a row menu, so the parent owns open state.
export function ChangeRoleDialog({
  member,
  canGrantOwner,
  onOpenChange,
}: {
  member: { id: string; name: string; role: OrgRole };
  canGrantOwner: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState<OrgRole>(member.role);
  const { pending, error, setError, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await changeRoleFn({ data: { memberId: member.id, role } });
      toast.success("Role updated", { description: member.name });
      onOpenChange(false);
      await router.invalidate();
    }, "Could not change the role.");
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
