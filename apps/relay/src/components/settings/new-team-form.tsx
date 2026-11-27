import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { NameField } from "../form/text-field";
import { createTeamFn } from "../../console/members.fns";
import { FormError, FormBody, FormActions } from "../page/form-parts";
import { useSubmit } from "../use-submit";

export function NewTeamForm({ done }: { done: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const { pending, error, setError, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createTeamFn({ data: { name } });
      toast.success("Team created", { description: name });
      done();
      await router.invalidate();
    }, "Could not create the team.");
  }

  return (
    <FormBody onSubmit={submit}>
      <NameField id="team-name" autoFocus placeholder="Support" value={name} onChange={(e) => setName(e.target.value)} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Create team" pending={pending} pendingLabel="Creating…" disabled={!name.trim()} disabledReason="Enter a name first." />
    </FormBody>
  );
}
