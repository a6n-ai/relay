import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { PageDenied } from "../../components/page/page-denied";
import { ChoiceField } from "../../components/form/choice-field";
import { TextField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError } from "../../components/page/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { useCan } from "../../components/use-can";
import { addDomainFn } from "../../console/domains.fns";
import { SES_REGIONS } from "../../shared/regions";
import { looksLikeDomain, normaliseDomainInput } from "../../components/lib/domain-input";
import { useSubmit } from "../../components/use-submit";

export const Route = createFileRoute("/_app/domains_/new")({
  component: AddDomainPage,
});

const crumbs = [{ label: "Domains", to: "/domains" }, { label: "Add domain" }];
const BAD_DOMAIN = "Enter a domain like example.com, without https:// or a path.";

function AddDomainPage() {
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ sending: ["write"] });
  const navigate = useNavigate();
  const [domain, setDomain] = useState("");
  const [region, setRegion] = useState("default");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { pending, error, setError, run } = useSubmit();

  if (!canWrite) {
    return <PageDenied crumbs={crumbs} />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = normaliseDomainInput(domain);
    setDomain(clean);
    if (!looksLikeDomain(clean)) {
      setFieldError(BAD_DOMAIN);
      return;
    }
    await run(async () => {
      await addDomainFn({ data: { domain: clean, ...(region === "default" ? {} : { sesRegion: region }) } });
      toast.success("Domain added", { description: "Add its DNS records to verify it." });
      await navigate({ to: "/domains", search: { q: undefined, status: undefined } });
    }, "Could not add the domain.");
  }

  return (
    <CreatePage crumbs={crumbs} description="Verify a domain to send from your own addresses and receive mail on it." onSubmit={submit}>
      <SettingsCard title="Domain" description="Next you will add DNS records to verify it.">
        <div className="grid gap-4">
          {shell.platformAdmin ? (
            <ChoiceField
              id="domain-region"
              label="Sending region"
              value={region}
              onChange={setRegion}
              options={[{ value: "default", label: "Workspace default" }, ...SES_REGIONS.map((r) => ({ value: r.id, label: r.id }))]}
            />
          ) : null}
          <TextField
            id="domain-name"
            label="Domain"
            error={fieldError}
            onClearError={() => setFieldError(null)}
            autoFocus
            required
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onBlur={() => {
              const clean = normaliseDomainInput(domain);
              setDomain(clean);
              setFieldError(clean && !looksLikeDomain(clean) ? BAD_DOMAIN : null);
            }}
          />
        </div>
      </SettingsCard>
      <FormError message={error} />
      <FormActions
        onCancel={() => void navigate({ to: "/domains", search: { q: undefined, status: undefined } })}
        submitLabel="Add domain"
        pending={pending}
        pendingLabel="Adding…"
        disabled={!domain.trim()}
        disabledReason="Enter a domain first."
      />
    </CreatePage>
  );
}
