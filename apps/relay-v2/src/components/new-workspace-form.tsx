import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { createWorkspaceFn } from "../console/workspaces.fns";
import { errorText } from "./error-text";
import { SlugField } from "./form/slug-field";
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

  return (
    <FormBody onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor="workspace-name">Name</Label>
        <Input
          id="workspace-name"
          required
          autoFocus
          maxLength={80}
          placeholder="Acme Inc"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <SlugField id="workspace-slug" name={name} value={slug} onChange={setSlug} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Create workspace" pending={pending} pendingLabel="Creating…" />
    </FormBody>
  );
}
