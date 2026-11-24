import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { createWorkspaceFn } from "../console/workspaces.fns";
import { errorText } from "./error-text";
import { FormError } from "./form-error";

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
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="workspace-name">Name</Label>
      <Input id="workspace-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <Label htmlFor="workspace-slug">Slug</Label>
      <Input
        id="workspace-slug"
        required
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        aria-describedby="workspace-slug-hint"
      />
      <p id="workspace-slug-hint" className="text-xs text-muted-foreground">
        Lowercase letters, numbers and hyphens.
      </p>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Create workspace
        </Button>
      </div>
    </form>
  );
}
