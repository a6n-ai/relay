import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { errorText } from "../error-text";
import { FormActions, FormBody, FormError } from "../page/form-parts";
import { Hint } from "../page/text";

export function RenameForm({
  id,
  noun,
  initial,
  placeholder,
  hint,
  save,
  done,
}: {
  id: string;
  noun: string;
  initial: string;
  placeholder?: string;
  hint?: string;
  save: (name: string) => Promise<unknown>;
  done: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = !!name.trim() && name.trim() !== initial;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setPending(true);
    setError(null);
    try {
      await save(name.trim());
      toast.success(`${noun} renamed`, { description: name.trim() });
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, `Could not rename the ${noun.toLowerCase()}.`));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormBody onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Name</Label>
        <Input id={id} required autoFocus maxLength={80} placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {hint ? <Hint size="xs">{hint}</Hint> : null}
      <FormError message={error} />
      <FormActions cancel submitLabel="Save name" pending={pending} pendingLabel="Saving…" disabled={!dirty} />
    </FormBody>
  );
}
