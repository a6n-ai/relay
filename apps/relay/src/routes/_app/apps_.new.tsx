import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { PageDenied } from "../../components/page/page-denied";
import { SlugField } from "../../components/form/slug-field";
import { splitSlugError } from "../../components/form/slugify";
import { NameField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError } from "../../components/page/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { useCan } from "../../components/use-can";
import { createAppFn } from "../../console/apps.fns";
import { useSubmit } from "../../components/use-submit";

export const Route = createFileRoute("/_app/apps_/new")({
  component: NewAppPage,
});

const crumbs = [{ label: "Apps", to: "/apps" }, { label: "New app" }];

function NewAppPage() {
  const canWrite = useCan({ tenant: ["write"] });
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const { pending, error, setError, run } = useSubmit();

  if (!canWrite) {
    return <PageDenied crumbs={crumbs} />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const created = await createAppFn({ data: { name, slug } });
      toast.success("App created", { description: name });
      await navigate({ to: "/apps/$appId", params: { appId: created.id } });
    }, "Could not create the app.");
  }

  const split = splitSlugError(error);
  return (
    <CreatePage crumbs={crumbs} description="An app gets its own API keys, senders and messages." onSubmit={submit}>
      <SettingsCard title="Details" description="Name the product that sends mail through Relay.">
        <div className="grid gap-4">
          <NameField id="app-name" autoFocus placeholder="Marketing site" value={name} onChange={(e) => setName(e.target.value)} />
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
