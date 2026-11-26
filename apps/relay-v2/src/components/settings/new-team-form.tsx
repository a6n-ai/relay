import { Button } from "@foundry/ui/button";
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
      <Label htmlFor="team-name">Name</Label>
      <Input id="team-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <FormError message={error} />
      <FormActions>
        <Button type="submit" disabled={pending}>
          Create team
        </Button>
      </FormActions>
    </FormBody>
  );
}
