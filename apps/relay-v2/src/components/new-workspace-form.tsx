import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { createWorkspaceFn } from "../console/workspaces.fns";
import { errorText } from "./error-text";
import { TextField } from "./form/text-field";
import { SlugField } from "./form/slug-field";
import { splitSlugError } from "./form/slugify";
import { FormActions, FormBody, FormError } from "./page/form-parts";

export function NewWorkspaceForm({ done }: { done: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await createWorkspaceFn({ data: { name, slug } });
      toast.success("Workspace created", { description: name });
      done();
      await router.invalidate();
      await router.navigate({ to: "/apps" });
    } catch (err) {
      setError(errorText(err, "Could not create the workspace."));
    } finally {
      setPending(false);
    }
  }

  const split = splitSlugError(error);
  return (
    <FormBody onSubmit={submit}>
      <TextField
        id="workspace-name"
        label="Name"
        hint="A separate space with its own apps and people."
        required
        autoFocus
        maxLength={80}
        placeholder="Your company"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <SlugField id="workspace-slug" name={name} value={slug} onChange={setSlug} error={split.slug} />
      <FormError message={split.rest} />
      <FormActions cancel submitLabel="Create workspace" pending={pending} pendingLabel="Creating…" disabled={!name.trim()} disabledReason="Enter a name first." />
    </FormBody>
  );
}
