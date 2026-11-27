import { type FormEvent, useState } from "react";
import { NameField } from "../form/text-field";
import { createTeamFn } from "../../console/members.fns";
import { FormError, FormBody, FormActions } from "../form/form-parts";
import { useSubmit } from "../lib/use-submit";

export function NewTeamForm({ done }: { done: () => void }) {
  const [name, setName] = useState("");
  const { pending, error, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createTeamFn({ data: { name } });
    }, "Could not create the team.", { success: "Team created", description: name, after: done });
  }

  return (
    <FormBody onSubmit={submit}>
      <NameField id="team-name" autoFocus placeholder="Support" value={name} onChange={(e) => setName(e.target.value)} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Create team" pending={pending} pendingLabel="Creating…" disabled={!name.trim()} disabledReason="Enter a name first." />
    </FormBody>
  );
}
