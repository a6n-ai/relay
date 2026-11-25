import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { GlobeIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { AppSelect } from "../../components/app-select";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { DnsRecords } from "../../components/dns-records";
import { DomainDeleteDialog } from "../../components/domain-delete-dialog";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { ResourceTable } from "../../components/resource-table";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { EmptyState } from "../../components/page/empty-state";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { useNewParam } from "../../components/shell/create-menu";
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
import { FormBody, FormActions } from "../../components/page/form-parts";
import { Hint, Mono } from "../../components/page/text";

export const Route = createFileRoute("/_app/domains")({
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === 1 || search.new === "1" ? (1 as const) : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  loader: async () => {
    const domains = await fetchDomains();
    if (!domains) return null;
    const [addresses, apps] = await Promise.all([fetchAddresses(), fetchApps()]);
    return { domains, addresses, apps: apps ?? [] };
  },
  pendingComponent: () => <TableSkeleton columns={3} />,
  component: DomainsPage,
});

const KINDS = [
  { value: "sender", label: "Sends" },
  { value: "inbox", label: "Receives" },
  { value: "both", label: "Sends and receives" },
] as const;

function DomainsPage() {
  const data = Route.useLoaderData();
  const [q, setQ] = useUrlFilter("q");
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const [newOpen, setNewOpen] = useNewParam();
  const canWrite = useCan({ sending: ["write"] });
  const canManageMail = useCan({ mailbox: ["manage"] });
  const [releasing, setReleasing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; domain: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; email: string; displayName: string | null; replyTo: string | null } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);
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
  const domains = needle ? data.domains.filter((d) => d.domain.toLowerCase().includes(needle)) : data.domains;
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
    try {
      await releaseDomainFn({ data: { id } });
      toast.success("Domain released");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not release the domain"));
    }
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

  async function setCanSend(id: string, canSend: boolean) {
    try {
      await updateAddressFn({ data: { id, canSend } });
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not update the address"));
    }
  }

  async function remove(id: string) {
    try {
      await removeAddressFn({ data: { id } });
      toast.success("Address removed");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not remove the address"));
    }
  }

  return (
    <>
      <PageHeader crumbs={crumbs} />
      <Toolbar
        search={
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search domains and addresses"
          />
        }
      >
        {canWrite ? (
          <Button variant="outline" size="sm" onClick={() => setAddressOpen(true)}>
            Add address
          </Button>
        ) : null}
        {canWrite ? (
          <CreateDialog title="Add an address" open={addressOpen} onOpenChange={setAddressOpen}>
            {(done) => <NewAddressForm apps={apps} done={done} />}
          </CreateDialog>
        ) : null}
        {canWrite ? (
          <CreateDialog trigger="Add domain" title="Add a sending domain" open={newOpen} onOpenChange={setNewOpen}>
            {(done) => <NewDomainForm done={done} />}
          </CreateDialog>
        ) : null}
      </Toolbar>

      <h2 className="px-4 pb-2 text-sm font-medium">Domains</h2>
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
        menu={(d) => [
          { label: "Check now", hidden: !canWrite, onSelect: () => void check(d.id) },
          { label: d.protected ? "Unprotect" : "Protect", hidden: !shell.platformAdmin, onSelect: () => void setProtected(d.id, !d.protected) },
          { label: "Release", hidden: !(shell.platformAdmin && d.releasable), onSelect: () => setReleasing(d.id) },
          { label: "Delete", hidden: !shell.platformAdmin, destructive: true, onSelect: () => setDeleting({ id: d.id, domain: d.domain }) },
        ]}
        empty={
          needle ? (
            "No domains match your search."
          ) : (
            <EmptyState
              icon={GlobeIcon}
              title="Add a domain to send from your own address."
              action={
                canWrite ? (
                  <Button size="sm" onClick={() => setNewOpen(true)}>
                    Add domain
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />

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
          {
            header: "Can send",
            cell: (a) =>
              canWrite ? (
                <Switch checked={a.canSend} onCheckedChange={(v) => setCanSend(a.id, v)} aria-label={`Can send from ${a.email}`} />
              ) : a.canSend ? (
                "Yes"
              ) : (
                "No"
              ),
          },
        ]}
        rows={addresses}
        rowKey={(a) => a.id}
        menu={(a) => [
          { label: "Access", hidden: !(canManageMail && a.kind !== "sender"), to: "/domains/addresses/$addressId", params: { addressId: a.id } },
          { label: "Edit", hidden: !canWrite, onSelect: () => setEditing(a) },
          { label: "Remove", hidden: !canWrite, destructive: true, onSelect: () => setRemoving(a.id) },
        ]}
        empty={needle ? "No addresses match your search." : "No addresses yet. Add one on a verified domain to send from it."}
      />

      <ConfirmDialog
        open={releasing !== null}
        onOpenChange={(o) => !o && setReleasing(null)}
        title="Release this domain?"
        description="The domain and its SES identity are deleted. If it is added again, the DNS records change and must be updated."
        confirmLabel="Release domain"
        onConfirm={() => releasing && release(releasing)}
      />
      {deleting ? <DomainDeleteDialog id={deleting.id} domain={deleting.domain} open onOpenChange={(o) => !o && setDeleting(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this address?"
        description="Mail to it stops being received, and the app can no longer send from it."
        confirmLabel="Remove address"
        onConfirm={() => removing && remove(removing)}
      />
      {editing ? (
        <CreateDialog open title="Edit address" onOpenChange={(o) => !o && setEditing(null)}>
          {(done) => <EditAddressForm address={editing} done={done} />}
        </CreateDialog>
      ) : null}
    </>
  );
}

function NewDomainForm({ done }: { done: () => void }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addDomainFn({ data: { domain } });
      toast.success("Domain added", { description: domain });
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
        required
        placeholder="example.com"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        aria-describedby="domain-hint"
      />
      <Hint size="xs" id="domain-hint">
        Add the DNS records it shows, then press Check now.
      </Hint>
      <FormError message={error} />
      <FormActions>
        <Button type="submit" disabled={pending}>
          Add domain
        </Button>
      </FormActions>
    </FormBody>
  );
}

function NewAddressForm({
  apps,
  done,
}: {
  apps: { id: string; name: string }[];
  done: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [appId, setAppId] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("sender");
  const [name, setName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addAddressFn({ data: { appId, email, kind, displayName: name || undefined, replyTo: replyTo || undefined } });
      toast.success("Address added", { description: email });
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not add the address."));
    } finally {
      setPending(false);
    }
  }

  if (apps.length === 0) return <Hint>Create an app first. Addresses belong to an app.</Hint>;

  return (
    <FormBody onSubmit={submit}>
      <Label htmlFor="address-email">Address</Label>
      <Input id="address-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Label htmlFor="address-app">App</Label>
      <AppSelect
        apps={apps}
        value={appId}
        onValueChange={setAppId}
        id="address-app"
        placeholder="Choose an app"
      />
      <Label htmlFor="address-kind">Use</Label>
      <Select value={kind} onValueChange={(v) => setKind(v as (typeof KINDS)[number]["value"])}>
        <SelectTrigger id="address-kind">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KINDS.map((k) => (
            <SelectItem key={k.value} value={k.value}>
              {k.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="address-name">Name (optional)</Label>
      <Input id="address-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <Label htmlFor="address-reply-to">Reply-To (optional)</Label>
      <Input id="address-reply-to" type="email" maxLength={254} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
      <FormError message={error} />
      <FormActions>
        <Button type="submit" disabled={pending || !appId}>
          Add address
        </Button>
      </FormActions>
    </FormBody>
  );
}

function EditAddressForm({
  address,
  done,
}: {
  address: { id: string; email: string; displayName: string | null; replyTo: string | null };
  done: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(address.displayName ?? "");
  const [replyTo, setReplyTo] = useState(address.replyTo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await updateAddressFn({ data: { id: address.id, displayName: name.trim() || null, replyTo: replyTo.trim() || null } });
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
      <Mono className="block">{address.email}</Mono>
      <Label htmlFor="edit-address-name">Name</Label>
      <Input id="edit-address-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <Label htmlFor="edit-address-reply-to">Reply-To</Label>
      <Input id="edit-address-reply-to" type="email" maxLength={254} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
      <FormError message={error} />
      <FormActions>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
      </FormActions>
    </FormBody>
  );
}
