import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { errorText } from "../../components/error-text";
import { SlugField } from "../../components/form/slug-field";
import { splitSlugError } from "../../components/form/slugify";
import { TextField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError } from "../../components/page/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { createWorkspaceFn } from "../../console/workspaces.fns";
import { NAME_MAX } from "../../shared/limits";

export const Route = createFileRoute("/_app/workspaces_/new")({
  staticData: { allowsNoWorkspace: true },
  component: NewWorkspacePage,
});

// Any signed-in user may start a workspace, so there is no role gate; /_app lets it through with no active workspace.
function NewWorkspacePage() {
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const back = shell.active ? { label: "Settings", to: "/settings" as const } : { label: "Workspaces", to: "/no-workspace" as const };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await createWorkspaceFn({ data: { name, slug } });
      toast.success("Workspace created", { description: name });
      await router.invalidate();
      await navigate({ to: "/apps" });
    } catch (err) {
      setError(errorText(err, "Could not create the workspace."));
    } finally {
      setPending(false);
    }
  }

  const split = splitSlugError(error);
  return (
    <CreatePage crumbs={[back, { label: "New workspace" }]} description="A separate space with its own apps and people." onSubmit={submit}>
      <SettingsCard title="Details" description="Name the team or company that will send mail.">
        <div className="grid gap-4">
          <TextField id="workspace-name" label="Name" required autoFocus maxLength={NAME_MAX} placeholder="Your company" value={name} onChange={(e) => setName(e.target.value)} />
          <SlugField id="workspace-slug" name={name} value={slug} onChange={setSlug} error={split.slug} />
        </div>
      </SettingsCard>
      <FormError message={split.rest} />
      <FormActions
        onCancel={() => void navigate({ to: back.to })}
        submitLabel="Create workspace"
        pending={pending}
        pendingLabel="Creating…"
        disabled={!name.trim()}
        disabledReason="Enter a name first."
      />
    </CreatePage>
  );
}
