import { TextField } from "../../components/form/text-field";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { FixedField } from "../../components/form/fixed-field";
import { FormError, FormPanel } from "../../components/page/form-parts";
import { DeleteWorkspaceCard } from "../../components/settings/delete-workspace-card";
import { SettingsCard, SettingsForm } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { passwordStatusFn } from "../../console/password.fns";
import { renameWorkspaceFn } from "../../console/workspaces.fns";
import { PasswordCard } from "../../components/settings/password-card";
import { NAME_MAX } from "../../shared/limits";
import { useSubmit } from "../../components/use-submit";

export const Route = createFileRoute("/_app/settings")({
  staticData: { title: "Settings", copy: "Your workspace name and who has access." },
  loader: () => passwordStatusFn(),
  component: GeneralPage,
});

function WorkspaceNameCard({ name: current, slug }: { name: string; slug: string }) {
  const router = useRouter();
  const canRename = useCan({ organization: ["update"] });
  const [name, setName] = useState(current);
  const { pending, error, setError, run } = useSubmit();
  const next = name.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await renameWorkspaceFn({ data: { name: next } });
      toast.success("Workspace renamed", { description: next });
      await router.invalidate();
    }, "Could not rename the workspace.");
  }

  return (
    <SettingsForm
      title="Workspace name"
      description="The name shown in the workspace switcher."
      hint="Up to 80 characters."
      dirty={Boolean(next) && next !== current}
      pending={pending}
      saveLabel="Save name"
      canWrite={canRename}
      invalidReason={!next ? "Enter a name first." : undefined}
      onSubmit={submit}
    >
      <TextField id="workspace-name" label="Workspace name" hideLabel required maxLength={NAME_MAX} readOnly={!canRename} value={name} onChange={(e) => setName(e.target.value)} />
      <FixedField label="Short name" value={slug} hint="Create a new workspace to use a different address." />
      <FormError message={error} />
    </SettingsForm>
  );
}

function GeneralPage() {
  const { shell } = Route.useRouteContext();
  const { hasPassword } = Route.useLoaderData();
  const active = shell.active;
  const suspended = active?.status === "suspended";
  return (
    <>
      <PageHeader />
      <FormPanel>
        {suspended ? (
          <SettingsCard
            title="Workspace suspended"
            description="Sending and changes are paused while the workspace is suspended. Contact support to resume it."
          />
        ) : null}
        {active ? <WorkspaceNameCard key={`${active.id}-${active.name}`} name={active.name} slug={active.slug} /> : null}
        <PasswordCard hasPassword={hasPassword} />
        {active ? <DeleteWorkspaceCard slug={active.slug} /> : null}
      </FormPanel>
    </>
  );
}
