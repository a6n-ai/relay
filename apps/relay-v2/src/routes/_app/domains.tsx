import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { GlobeIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { DnsRecords } from "../../components/dns-records";
import { DomainDeleteDialog } from "../../components/domain-delete-dialog";
import { errorText } from "../../components/error-text";
import { AppField } from "../../components/form/app-field";
import { ChoiceField } from "../../components/form/choice-field";
import { DomainEmailInput } from "../../components/form/domain-email-input";
import { FixedField } from "../../components/form/fixed-field";
import { ResourceTable } from "../../components/resource-table";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { EmptyState } from "../../components/page/empty-state";
import { FilterMenu } from "../../components/page/filter-menu";
import { ResourceGrid } from "../../components/page/resource-grid";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ViewToggle } from "../../components/page/view-toggle";
import { type View, viewPref } from "../../components/page/view-pref";
import { useNewParam } from "../../components/shell/new-param";
import { PageHeader } from "../../components/shell/page-header";
import { fetchApps } from "../../console/apps.fns";
import {
  addAddressFn,
  addDomainFn,
  checkDomainFn,
  fetchAddresses,
  fetchDomains,
  releaseDomainFn,
  removeAddressFn,
  setDomainProtectedFn,
  updateAddressFn,
} from "../../console/domains.fns";
import { SES_REGIONS } from "../../core/ses-regions";
import { looksLikeDomain, normaliseDomainInput } from "../../lib/domain-input";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";
import { Hint, Mono } from "../../components/page/text";

export const Route = createFileRoute("/_app/domains")({
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === 1 || search.new === "1" ? (1 as const) : search.new === "address" ? ("address" as const) : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    status: search.status === "verified" || search.status === "pending" || search.status === "failed" ? search.status : undefined,
  }),
  loader: async () => {
    const domains = await fetchDomains();
    if (!domains) return null;
    const [addresses, apps] = await Promise.all([fetchAddresses(), fetchApps()]);
    return { domains, addresses, apps: apps ?? [] };
  },
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Domains" }]} columns={3} sections={["Domains", "Addresses"]} search filter view action />,
  component: DomainsPage,
});

type Kind = "sender" | "inbox" | "both";
const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "sender", label: "Send only", hint: "Your apps send email from this address. Mail sent to it is rejected." },
  { value: "inbox", label: "Receive only", hint: "Mail sent to this address shows up in Relay. Apps can't send from it." },
  { value: "both", label: "Send and receive", hint: "Your apps send from it, and replies show up in Relay." },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

const STATUS_FACET = {
  key: "status",
  label: "Status",
  options: [
    { value: "verified", label: "Verified" },
    { value: "pending", label: "Pending" },
    { value: "failed", label: "Failed" },
  ],
};

type Address = {
  id: string;
  email: string;
  kind: Kind;
  appName: string;
  displayName: string | null;
  replyTo: string | null;
  canSend: boolean;
};

function DomainsPage() {
  const data = Route.useLoaderData();
  const [q, setQ] = useUrlFilter("q");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { appId: scopeParam } = useSearch({ strict: false }) as { appId?: string };
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const [view, setView] = useState<View>(() => viewPref.read("/domains"));
  const [newOpen, setNewOpen] = useNewParam();
  const canWrite = useCan({ sending: ["write"] });
  const canManageMail = useCan({ mailbox: ["manage"] });
  const [releasing, setReleasing] = useState<{ id: string; domain: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; domain: string } | null>(null);
  const [editing, setEditing] = useState<Address | null>(null);
  const [removing, setRemoving] = useState<{ id: string; email: string } | null>(null);
  const [addressOpen, setAddressOpen] = useNewParam("address");
  const crumbs = [{ label: "Domains" }];
  if (!data) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const { apps } = data;
  const needle = q.trim().toLowerCase();
  const domains = data.domains.filter(
    (d) => (!needle || d.domain.toLowerCase().includes(needle)) && (!search.status || d.status === search.status),
  );
  const addressCount = new Map<string, number>();
  for (const a of data.addresses) {
    const d = a.email.slice(a.email.lastIndexOf("@") + 1);
    addressCount.set(d, (addressCount.get(d) ?? 0) + 1);
  }
  const scopedAppId = apps.some((a) => a.id === scopeParam) ? scopeParam : undefined;
  const addresses = needle
    ? data.addresses.filter((a) => [a.email, a.appName, a.displayName ?? ""].some((v) => v.toLowerCase().includes(needle)))
    : data.addresses;

  async function check(id: string) {
    try {
      const { status } = await checkDomainFn({ data: { id } });
      if (status === "verified") toast.success("Domain verified");
      else toast("Not verified yet", { description: "DNS can take a while to update." });
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not check the domain"));
    }
  }

  async function release(id: string) {
    await releaseDomainFn({ data: { id } });
    toast.success("Domain released");
    await router.invalidate();
  }

  async function setProtected(id: string, protectedNow: boolean) {
    try {
      await setDomainProtectedFn({ data: { id, protected: protectedNow } });
      toast.success(protectedNow ? "Domain protected" : "Domain unprotected");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not change protection"));
    }
  }

  async function remove(id: string) {
    await removeAddressFn({ data: { id } });
    toast.success("Address removed");
    await router.invalidate();
  }

  const domainMenu = (d: (typeof domains)[number]) => [
    { label: "Check now", hidden: !canWrite, onSelect: () => void check(d.id) },
    { label: d.protected ? "Unprotect" : "Protect", hidden: !shell.platformAdmin, onSelect: () => void setProtected(d.id, !d.protected) },
    { label: "Release", hidden: !(shell.platformAdmin && d.releasable), onSelect: () => setReleasing({ id: d.id, domain: d.domain }) },
    { label: "Delete", hidden: !shell.platformAdmin, destructive: true, onSelect: () => setDeleting({ id: d.id, domain: d.domain }) },
  ];

  const domainsEmpty = needle || search.status ? (
    "No domains match your filters."
  ) : (
    <EmptyState
      icon={GlobeIcon}
      title="Add a domain to send from your own address."
      action={
        canWrite ? (
          <Button variant="outline" onClick={() => setNewOpen(true)}>
            Add domain
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <>
      <PageHeader crumbs={crumbs} />
      <Toolbar
        search={<SearchInput value={q} onChange={setQ} placeholder="Search domains and addresses" />}
        filters={<FilterMenu facets={[STATUS_FACET]} value={search} onChange={(next) => void navigate({ to: ".", search: next as never })} />}
        view={<ViewToggle route="/domains" value={view} onChange={setView} />}
      >
        {canWrite ? (
          <Button variant="outline" onClick={() => setAddressOpen(true)}>
            Add address
          </Button>
        ) : null}
        {canWrite ? (
          <CreateDialog title="Add an address" open={addressOpen} onOpenChange={setAddressOpen}>
            {(done) => (
              <NewAddressForm
                apps={apps}
                domains={data.domains}
                scopedAppId={scopedAppId}
                done={done}
                onAddDomain={() => {
                  done();
                  setNewOpen(true);
                }}
              />
            )}
          </CreateDialog>
        ) : null}
        {canWrite ? (
          <CreateDialog trigger="Add domain" title="Add a sending domain" open={newOpen} onOpenChange={setNewOpen}>
            {(done) => <NewDomainForm done={done} canPickRegion={shell.platformAdmin} />}
          </CreateDialog>
        ) : null}
      </Toolbar>

      <h2 className="px-4 pb-2 text-sm font-medium">Domains</h2>
      {view === "grid" ? (
        <ResourceGrid
          items={domains}
          rowKey={(d) => d.id}
          rowLabel={(d) => d.domain}
          menu={domainMenu}
          empty={domainsEmpty}
          card={(d) => (
            <div className="grid gap-2 pr-8">
              <Mono>{d.domain}</Mono>
              <div className="flex items-center gap-2">
                <StatusBadge status={d.status} />
                {d.protected ? <Badge variant="warning">Protected</Badge> : null}
              </div>
              <Hint size="xs">
                {addressCount.get(d.domain) ?? 0} {addressCount.get(d.domain) === 1 ? "address" : "addresses"} · {d.sesRegion}
              </Hint>
            </div>
          )}
        />
      ) : (
        <ResourceTable
          columns={[
            {
              header: "Domain",
              cell: (d) => (
                <div className="flex flex-col gap-1">
                  <Mono>{d.domain}</Mono>
                  {d.protected ? (
                    <>
                      <Badge variant="warning">Protected</Badge>
                      <Hint as="span" size="xs">Mail sent from this domain stops if it is released or deleted.</Hint>
                    </>
                  ) : null}
                </div>
              ),
            },
            { header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
            { header: "DNS", cell: (d) => <DnsRecords records={d.records} /> },
          ]}
          rows={domains}
          rowKey={(d) => d.id}
          menu={domainMenu}
          empty={domainsEmpty}
        />
      )}

      <h2 className="px-4 pb-2 pt-6 text-sm font-medium">Addresses</h2>
      <ResourceTable
        columns={[
          {
            header: "Address",
            cell: (a) =>
              canManageMail && a.kind !== "sender" ? (
                <Link to="/domains/addresses/$addressId" params={{ addressId: a.id }} className="font-mono text-xs hover:underline">
                  {a.email}
                </Link>
              ) : (
                <Mono>{a.email}</Mono>
              ),
          },
          { header: "App", cell: (a) => a.appName },
          { header: "Name", cell: (a) => a.displayName ?? "—" },
          { header: "Reply-To", cell: (a) => a.replyTo ?? "—" },
          { header: "Mail", cell: (a) => KIND_LABEL[a.kind] },
        ]}
        rows={addresses}
        rowKey={(a) => a.id}
        menu={(a) => [
          { label: "Access", hidden: !(canManageMail && a.kind !== "sender"), to: "/domains/addresses/$addressId", params: { addressId: a.id } },
          { label: "Edit", hidden: !canWrite, onSelect: () => setEditing(a) },
          { label: "Remove", hidden: !canWrite, destructive: true, onSelect: () => setRemoving({ id: a.id, email: a.email }) },
        ]}
        empty={needle ? "No addresses match your search." : "No addresses yet. Add one on a verified domain to send from it."}
      />

      <ConfirmDialog
        open={releasing !== null}
        onOpenChange={(o) => !o && setReleasing(null)}
        title={`Release ${releasing?.domain ?? "this domain"}?`}
        description="The domain and its SES identity are deleted. If it is added again, the DNS records change and must be updated."
        confirmLabel="Release domain"
        onConfirm={async () => {
          if (releasing) await release(releasing.id);
        }}
      />
      {deleting ? <DomainDeleteDialog id={deleting.id} domain={deleting.domain} open onOpenChange={(o) => !o && setDeleting(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.email ?? "this address"}?`}
        description="Mail to it stops being received, its access grants are deleted, and the app can no longer send from it."
        confirmLabel="Remove address"
        onConfirm={async () => {
          if (removing) await remove(removing.id);
        }}
      />
      {editing ? (
        <CreateDialog open title="Edit address" onOpenChange={(o) => !o && setEditing(null)}>
          {(done) => <EditAddressForm address={editing} done={done} />}
        </CreateDialog>
      ) : null}
    </>
  );
}

function NewDomainForm({ done, canPickRegion }: { done: () => void; canPickRegion: boolean }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [region, setRegion] = useState("default");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const check = (value: string) =>
    setFieldError(value && !looksLikeDomain(value) ? "Enter a domain like example.com, without https:// or a path." : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = normaliseDomainInput(domain);
    setDomain(clean);
    if (!looksLikeDomain(clean)) {
      setFieldError("Enter a domain like example.com, without https:// or a path.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await addDomainFn({ data: { domain: clean, ...(region === "default" ? {} : { sesRegion: region }) } });
      toast.success("Domain added", { description: clean });
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not add the domain."));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormBody onSubmit={submit}>
      <Label htmlFor="domain-name">Domain</Label>
      <Input
        id="domain-name"
        autoFocus
        required
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="example.com"
        value={domain}
        onChange={(e) => {
          setDomain(e.target.value);
          setFieldError(null);
        }}
        onBlur={() => {
          const clean = normaliseDomainInput(domain);
          setDomain(clean);
          check(clean);
        }}
        aria-invalid={!!fieldError}
        aria-describedby="domain-hint"
      />
      <FormError message={fieldError} />
      <Hint size="xs" id="domain-hint">
        You will add DNS records next; press Check now to verify.
      </Hint>
      {canPickRegion ? (
        <ChoiceField
          id="domain-region"
          label="Sending region"
          value={region}
          onChange={setRegion}
          options={[{ value: "default", label: "Workspace default" }, ...SES_REGIONS.map((r) => ({ value: r, label: r }))]}
        />
      ) : null}
      <FormError message={error} />
      <FormActions cancel submitLabel="Add domain" pending={pending} pendingLabel="Adding…" />
    </FormBody>
  );
}

const LOCAL_RE = /^[a-z0-9._-]+$/;

function NewAddressForm({
  apps,
  domains,
  scopedAppId,
  done,
  onAddDomain,
}: {
  apps: { id: string; name: string }[];
  domains: { domain: string; status: string }[];
  scopedAppId?: string;
  done: () => void;
  onAddDomain: () => void;
}) {
  const router = useRouter();
  const [address, setAddress] = useState({ local: "", domain: "" });
  const [appId, setAppId] = useState("");
  const [kind, setKind] = useState<Kind>("sender");
  const [name, setName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      await addAddressFn({ data: { appId, email, kind, displayName: name.trim() || undefined, replyTo: replyTo.trim() || undefined } });
      toast.success("Address added", { description: email });
      done();
      await router.invalidate();
    } catch (err) {
      const text = errorText(err, "Could not add the address.");
      if (err instanceof Error && err.message === "address already exists") setServerError("That address already exists.");
      else if (err instanceof Error && err.message === "domain not verified") setServerError(`Verify ${address.domain} first to receive mail on it.`);
      else setError(text);
    } finally {
      setPending(false);
    }
  }

  if (apps.length === 0) return <Hint>Create an app first. Addresses belong to an app.</Hint>;
  if (domains.length === 0) {
    return (
      <div className="grid gap-3">
        <Hint>Add and verify a domain first. Addresses live on your domains.</Hint>
        <FormActions cancel>
          <Button type="button" onClick={onAddDomain}>
            Add domain
          </Button>
        </FormActions>
      </div>
    );
  }

  return (
    <FormBody onSubmit={submit}>
      <AppField apps={apps} scopedAppId={scopedAppId} value={appId} onChange={setAppId} id="address-app" />
      <FormError message={appError} />
      <div className="grid gap-1.5">
        <Label htmlFor="address-local">Address</Label>
        <DomainEmailInput
          id="address-local"
          autoFocus
          domains={domains}
          kind={kind}
          value={address}
          onChange={(v) => {
            setAddress(v);
            setServerError(null);
          }}
        />
        <FormError message={localError ?? serverError} />
      </div>
      <ChoiceField
        id="address-kind"
        label="Mail"
        value={kind}
        onChange={(v) => setKind(v as Kind)}
        options={KINDS.map(({ value, label }) => ({ value, label }))}
      />
      <Hint size="xs">{KINDS.find((k) => k.value === kind)?.hint}</Hint>
      <div className="grid gap-1.5">
        <Label htmlFor="address-name">Name (optional)</Label>
        <Input
          id="address-name"
          maxLength={80}
          placeholder={appName ?? "Acme Support"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Hint size="xs">Shown to recipients, like Acme Support.</Hint>
      </div>
      {showReply ? (
        <div className="grid gap-1.5">
          <Label htmlFor="address-reply-to">Reply-To (optional)</Label>
          <Input
            id="address-reply-to"
            type="email"
            maxLength={254}
            placeholder={address.local && address.domain ? email : "Same as the address"}
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
          />
        </div>
      ) : (
        <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setShowReply(true)}>
          Set a reply-to address
        </Button>
      )}
      <FormError message={error} />
      <FormActions cancel submitLabel="Add address" pending={pending} pendingLabel="Adding…" />
    </FormBody>
  );
}

function EditAddressForm({ address, done }: { address: Address; done: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(address.displayName ?? "");
  const [replyTo, setReplyTo] = useState(address.replyTo ?? "");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const reply = replyTo.trim();
    if (reply && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply)) {
      setReplyError("Enter a valid email address or leave it blank.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await updateAddressFn({
        data: { id: address.id, displayName: name.trim() || null, replyTo: reply || null },
      });
      toast.success("Address updated", { description: address.email });
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not update the address."));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormBody onSubmit={submit}>
      <FixedField label="Address" value={address.email} hint="Remove it and add a new one to change it." />
      <FixedField label="App" value={address.appName} hint="Remove the address and add it again under another app." />
      <FixedField
        label="Mail"
        value={KIND_LABEL[address.kind] ?? address.kind}
        hint={`${KINDS.find((k) => k.value === address.kind)?.hint ?? ""} Can't be changed. Remove the address and add it again to change it.`.trim()}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="edit-address-name">Name</Label>
        <Input id="edit-address-name" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-address-reply-to">Reply-To</Label>
        <Input
          id="edit-address-reply-to"
          type="email"
          maxLength={254}
          value={replyTo}
          aria-invalid={!!replyError}
          onChange={(e) => {
            setReplyTo(e.target.value);
            setReplyError(null);
          }}
        />
        <FormError message={replyError} />
      </div>
      <FormError message={error} />
      <FormActions cancel submitLabel="Save address" pending={pending} pendingLabel="Saving…" />
    </FormBody>
  );
}
