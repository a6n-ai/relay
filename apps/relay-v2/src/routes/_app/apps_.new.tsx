import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { SlugField } from "../../components/form/slug-field";
import { splitSlugError } from "../../components/form/slugify";
import { TextField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError } from "../../components/page/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { createAppFn } from "../../console/apps.fns";

export const Route = createFileRoute("/_app/apps_/new")({
  component: NewAppPage,
});

const crumbs = [{ label: "Apps", to: "/apps" }, { label: "New app" }];

function NewAppPage() {
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ tenant: ["write"] });
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!canWrite) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await createAppFn({ data: { name, slug } });
      toast.success("App created", { description: name });
      await navigate({ to: "/apps/$appId", params: { appId: created.id } });
    } catch (err) {
      setError(errorText(err, "Could not create the app."));
    } finally {
      setPending(false);
    }
  }

  const split = splitSlugError(error);
  return (
    <CreatePage crumbs={crumbs} description="An app gets its own API keys, senders and messages." onSubmit={submit}>
      <SettingsCard title="Details" description="Name the product that sends mail through Relay.">
        <div className="grid gap-4">
          <TextField id="app-name" label="Name" required autoFocus maxLength={80} placeholder="Marketing site" value={name} onChange={(e) => setName(e.target.value)} />
          <SlugField id="app-slug" name={name} value={slug} onChange={setSlug} error={split.slug} />
        </div>
      </SettingsCard>
      <FormError message={split.rest} />
      <FormActions
        onCancel={() => void navigate({ to: "/apps" })}
        submitLabel="Create app"
        pending={pending}
        pendingLabel="Creating…"
        disabled={!name.trim()}
        disabledReason="Enter a name first."
      />
    </CreatePage>
  );
}
