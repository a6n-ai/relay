import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { errorText } from "../error-text";
import { createTeamFn } from "../../console/members.fns";
import { FormError, FormBody, FormActions } from "../page/form-parts";

export function NewTeamForm({ done }: { done: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await createTeamFn({ data: { name } });
      toast.success("Team created", { description: name });
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not create the team."));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormBody onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor="team-name">Name</Label>
        <Input id="team-name" required autoFocus maxLength={80} placeholder="Support" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <FormError message={error} />
      <FormActions cancel submitLabel="Create team" pending={pending} pendingLabel="Creating…" />
    </FormBody>
  );
}
