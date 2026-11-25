import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { errorText } from "../error-text";
import { FormError } from "../form-error";
import { type MemberRole, RoleSelect } from "../role-select";
import { inviteMemberFn } from "../../console/members.fns";

export function InviteForm({ done, canGrantOwner }: { done: () => void; canGrantOwner: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await inviteMemberFn({ data: { email, role } });
      toast.success("Invite sent", { description: email });
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not send the invite."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="invite-email">Email</Label>
      <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Label htmlFor="invite-role">Role</Label>
      <RoleSelect id="invite-role" value={role} onChange={setRole} canGrantOwner={canGrantOwner} />
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Send invite
        </Button>
      </div>
    </form>
  );
}
