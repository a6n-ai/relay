import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@foundry/ui/button";
import { PageDenied } from "../../components/page/page-denied";
import { errorText } from "../../components/lib/error-text";
import { codeOf } from "../../shared/errors";
import { AppField, needsAppChoice } from "../../components/form/app-field";
import { ChoiceField } from "../../components/form/choice-field";
import { DomainEmailInput } from "../../components/form/domain-email-input";
import { TextField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { EmptyState } from "../../components/page/empty-state";
import { FormActions, FormError } from "../../components/form/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/lib/use-can";
import { addAddressFn, fetchDomains } from "../../console/domains.fns";
import { type Kind, KINDS, LOCAL_RE } from "../../components/lib/address-kinds";
import { EMAIL_MAX, NAME_MAX } from "../../shared/limits";
import { str } from "../../components/lib/route-search";
import type { Crumb } from "../../components/shell/page-header";

export const Route = createFileRoute("/_app/domains_/addresses/new")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: str(search.appId),
  }),
  loader: async () => ({ domains: (await fetchDomains()) ?? [] }),
  component: AddAddressPage,
});

const crumbs: Crumb[] = [{ label: "Domains", to: "/domains" }, { label: "Add address" }];

function AddAddressPage() {
  const { domains } = Route.useLoaderData();
  const { appId: scopeParam } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const { apps } = shell;
  const canWrite = useCan({ sending: ["write"] });
  const navigate = useNavigate();
  const [address, setAddress] = useState({ local: "", domain: "" });
  const [appId, setAppId] = useState("");
  const [kind, setKind] = useState<Kind>("sender");
  const [name, setName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!canWrite) {
    return <PageDenied crumbs={crumbs} />;
  }

  const blocker =
    apps.length === 0
      ? { title: "Create an app first", description: "Addresses belong to an app.", to: "/apps/new", label: "New app" }
      : domains.length === 0
        ? { title: "Add a domain first", description: "Addresses live on your domains.", to: "/domains/new", label: "Add domain" }
        : null;
  if (blocker) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <EmptyState
          icon={MailIcon}
          title={blocker.title}
          description={blocker.description}
          action={
            <Button variant="outline" render={<Link to={blocker.to} />}>
              {blocker.label}
            </Button>
          }
        />
      </>
    );
  }

  const scopedAppId = apps.some((a) => a.id === scopeParam) ? scopeParam : undefined;
  const localError = !touched
    ? null
    : !address.local
      ? "Enter the part before the @."
      : !LOCAL_RE.test(address.local)
        ? "Use letters, numbers, dots, hyphens or underscores."
        : null;
  const appError = touched && !appId ? "Choose an app." : null;
  const email = `${address.local}@${address.domain}`;
  const appName = apps.find((a) => a.id === appId)?.name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    setError(null);
    setServerError(null);
    if (!address.local || !LOCAL_RE.test(address.local) || !appId) return;
    if (!address.domain) {
      setError("Verify your domain first to receive mail on it.");
      return;
    }
    setPending(true);
    try {
      const created = await addAddressFn({ data: { appId, email, kind, displayName: name.trim() || undefined, replyTo: replyTo.trim() || undefined } });
      toast.success("Address added", { description: email });
      await navigate({ to: "/domains/addresses/$addressId", params: { addressId: created.id } });
    } catch (err) {
      const text = errorText(err, "Could not add the address.");
      if (codeOf(err) === "address already exists") setServerError("That address already exists.");
      else if (codeOf(err) === "domain not verified") setServerError(`Verify ${address.domain} first to receive mail on it.`);
      else setError(text);
    } finally {
      setPending(false);
    }
  }

  return (
    <CreatePage crumbs={crumbs} description="Add an address your app sends from, receives mail on, or both." onSubmit={submit}>
      <SettingsCard title="Scope" description="The app this address belongs to.">
        <AppField apps={apps} scopedAppId={scopedAppId} value={appId} onChange={setAppId} id="address-app" autoFocus={needsAppChoice(apps, scopedAppId)} />
        <FormError message={appError} />
      </SettingsCard>
      <SettingsCard title="Address" description="The address and the verified domain it lives on.">
        <DomainEmailInput
          id="address-local"
          label="Address"
          hideLabel
          autoFocus={!needsAppChoice(apps, scopedAppId)}
          error={localError ?? serverError}
          domains={domains}
          kind={kind}
          value={address}
          onChange={(v) => {
            setAddress(v);
            setServerError(null);
          }}
        />
      </SettingsCard>
      <SettingsCard title="Mail" description="What this address can do.">
        <ChoiceField
          id="address-kind"
          label="Mail"
          hideLabel
          hint={KINDS.find((k) => k.value === kind)?.hint}
          value={kind}
          onChange={(v) => setKind(v as Kind)}
          options={KINDS.map(({ value, label }) => ({ value, label }))}
        />
      </SettingsCard>
      <SettingsCard title="Details" description="Optional. How the address appears to people who get your mail.">
        <div className="grid gap-4">
          <TextField
            id="address-name"
            label="Name (optional)"
            hint="Shown to recipients as the sender name."
            maxLength={NAME_MAX}
            placeholder={appName ?? "Support"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            id="address-reply-to"
            label="Reply-To (optional)"
            type="email"
            maxLength={EMAIL_MAX}
            placeholder={address.local && address.domain ? email : "Same as the address"}
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
          />
        </div>
      </SettingsCard>
      <FormError message={error} />
      <FormActions onCancel={() => void navigate({ to: "/domains", search: { q: undefined, status: undefined } })} submitLabel="Add address" pending={pending} pendingLabel="Adding…" />
    </CreatePage>
  );
}
