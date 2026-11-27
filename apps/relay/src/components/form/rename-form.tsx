import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { FormActions, FormBody, FormError } from "../page/form-parts";
import { NameField } from "./text-field";
import { useSubmit } from "../use-submit";

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
  const { pending, error, setError, run } = useSubmit();
  const dirty = !!name.trim() && name.trim() !== initial;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    await run(async () => {
      await save(name.trim());
      toast.success(`${noun} renamed`, { description: name.trim() });
      done();
      await router.invalidate();
    }, `Could not rename the ${noun.toLowerCase()}.`);
  }

  return (
    <FormBody onSubmit={submit}>
      <NameField id={id} hint={hint} autoFocus placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Save name" pending={pending} pendingLabel="Saving…" disabled={!dirty} disabledReason={name.trim() ? "Change the name to save." : "Enter a name first."} />
    </FormBody>
  );
}
