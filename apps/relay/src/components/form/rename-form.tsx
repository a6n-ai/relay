import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { errorText } from "../error-text";
import { FormActions, FormBody, FormError } from "../page/form-parts";
import { NameField } from "./text-field";

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
      <NameField id={id} hint={hint} autoFocus placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Save name" pending={pending} pendingLabel="Saving…" disabled={!dirty} disabledReason={name.trim() ? "Change the name to save." : "Enter a name first."} />
    </FormBody>
  );
}
