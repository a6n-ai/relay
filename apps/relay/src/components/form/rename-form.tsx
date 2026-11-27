import { type FormEvent, useState } from "react";
import { FormActions, FormBody, FormError } from "./form-parts";
import { NameField } from "./text-field";
import { useSubmit } from "../lib/use-submit";

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
  const [name, setName] = useState(initial);
  const { pending, error, run } = useSubmit();
  const dirty = !!name.trim() && name.trim() !== initial;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    await run(async () => {
      await save(name.trim());
    }, `Could not rename the ${noun.toLowerCase()}.`, { success: `${noun} renamed`, description: name.trim(), after: done });
  }

  return (
    <FormBody onSubmit={submit}>
      <NameField id={id} hint={hint} autoFocus placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Save name" pending={pending} pendingLabel="Saving…" disabled={!dirty} disabledReason={name.trim() ? "Change the name to save." : "Enter a name first."} />
    </FormBody>
  );
}
