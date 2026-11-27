import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { SlugField } from "../../components/form/slug-field";
import { splitSlugError } from "../../components/form/slugify";
import { NameField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError } from "../../components/form/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { createWorkspaceFn } from "../../console/workspaces.fns";
import { useSubmit } from "../../components/lib/use-submit";

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
  const { pending, error, run } = useSubmit();
  const back = shell.active ? { label: "Settings", to: "/settings" as const } : { label: "Workspaces", to: "/no-workspace" as const };

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createWorkspaceFn({ data: { name, slug } });
    }, "Could not create the workspace.", {
      success: "Workspace created",
      description: name,
      invalidate: false,
      after: async () => {
        await router.invalidate();
        await navigate({ to: "/apps" });
      },
    });
  }

  const split = splitSlugError(error);
  return (
    <CreatePage crumbs={[back, { label: "New workspace" }]} description="A separate space with its own apps and people." onSubmit={submit}>
      <SettingsCard title="Details" description="Name the team or company that will send mail.">
        <div className="grid gap-4">
          <NameField id="workspace-name" autoFocus placeholder="Your company" value={name} onChange={(e) => setName(e.target.value)} />
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
