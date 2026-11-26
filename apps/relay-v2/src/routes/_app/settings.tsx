import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { FixedField } from "../../components/form/fixed-field";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/page/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { passwordStatusFn } from "../../console/password.fns";
import { renameWorkspaceFn } from "../../console/workspaces.fns";
import { PasswordCard } from "../../components/settings/password-card";

export const Route = createFileRoute("/_app/settings")({
  loader: () => passwordStatusFn(),
  component: GeneralPage,
});

function WorkspaceNameCard({ name: current, slug }: { name: string; slug: string }) {
  const router = useRouter();
  const canRename = useCan({ organization: ["update"] });
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const next = name.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await renameWorkspaceFn({ data: { name: next } });
      toast.success("Workspace renamed", { description: next });
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not rename the workspace."));
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsCard
      title="Workspace name"
      description="The name shown in the workspace switcher."
      action={
        canRename ? (
          <Button type="submit" form="workspace-name-form" variant="outline" disabled={pending || !next || next === current}>
            {pending ? "Saving…" : "Save name"}
          </Button>
        ) : null
      }
    >
      <form id="workspace-name-form" onSubmit={submit} className="grid gap-1.5">
        <Label htmlFor="workspace-name" className="sr-only">
          Workspace name
        </Label>
        <Input id="workspace-name" required maxLength={80} readOnly={!canRename} value={name} onChange={(e) => setName(e.target.value)} />
        <FixedField label="Slug" value={slug} hint="Create a new workspace to use a different address." />
        <FormError message={error} />
      </form>
    </SettingsCard>
  );
}

function GeneralPage() {
  const { shell } = Route.useRouteContext();
  const { hasPassword } = Route.useLoaderData();
  const active = shell.active;
  const suspended = active?.status === "suspended";
  return (
    <>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "General" }]} />
      <div className="grid max-w-2xl gap-4 p-4">
        {suspended ? (
          <SettingsCard
            title="Workspace suspended"
            description="Sending and changes are paused while the workspace is suspended. Contact support to resume it."
            tone="danger"
          />
        ) : null}
        {active ? <WorkspaceNameCard key={`${active.id}-${active.name}`} name={active.name} slug={active.slug} /> : null}
        <PasswordCard hasPassword={hasPassword} />
      </div>
    </>
  );
}
