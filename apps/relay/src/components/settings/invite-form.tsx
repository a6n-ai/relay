import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { TextField } from "../form/text-field";
import { RoleChoice } from "./role-select";
import { type OrgRole } from "../../shared/roles";
import { inviteMemberFn } from "../../console/members.fns";
import { FormError, FormBody, FormActions } from "../page/form-parts";
import { useSubmit } from "../use-submit";

export function InviteForm({ done, canGrantOwner }: { done: () => void; canGrantOwner: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const { pending, error, setError, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await inviteMemberFn({ data: { email, role } });
      toast.success("Invite sent", { description: email });
      done();
      await router.invalidate();
    }, "Could not send the invite.");
  }

  return (
    <FormBody onSubmit={submit}>
      <TextField id="invite-email" label="Email" type="email" required autoFocus placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <RoleChoice id="invite-role" value={role} onChange={setRole} canGrantOwner={canGrantOwner} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Send invite" pending={pending} pendingLabel="Sending…" disabled={!email.trim()} disabledReason="Enter an email first." />
    </FormBody>
  );
}
