import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { errorText } from "../error-text";
import { type MemberRole, RoleChoice } from "../role-select";
import { inviteMemberFn } from "../../console/members.fns";
import { FormError, FormBody, FormActions } from "../page/form-parts";
import { Hint } from "../page/text";

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
    <FormBody onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          autoFocus
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <RoleChoice id="invite-role" value={role} onChange={setRole} canGrantOwner={canGrantOwner} />
      <Hint size="xs">An invite can't be edited. To change the role, cancel it and send a new one.</Hint>
      <FormError message={error} />
      <FormActions cancel submitLabel="Send invite" pending={pending} pendingLabel="Sending…" />
    </FormBody>
  );
}
