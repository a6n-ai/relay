import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { AppSelect } from "../../components/app-select";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { DnsRecords } from "../../components/dns-records";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { ResourceTable } from "../../components/resource-table";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { fetchApps } from "../../console/apps.fns";
import {
  addAddressFn,
  addDomainFn,
  checkDomainFn,
  fetchAddresses,
  fetchDomains,
  removeAddressFn,
  updateAddressFn,
} from "../../console/domains.fns";

export const Route = createFileRoute("/_app/domains")({
  loader: async () => {
    const domains = await fetchDomains();
    if (!domains) return null;
    const [addresses, apps] = await Promise.all([fetchAddresses(), fetchApps()]);
    return { domains, addresses, apps: apps ?? [] };
  },
  component: DomainsPage,
});

const KINDS = [
  { value: "sender", label: "Sends" },
  { value: "inbox", label: "Receives" },
  { value: "both", label: "Sends and receives" },
] as const;

function DomainsPage() {
  const data = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const canWrite = useCan({ sending: ["write"] });
  const canManageMail = useCan({ mailbox: ["manage"] });
  if (!data) {
    return (
      <>
        <ViewHeader title="Domains" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const { domains, addresses, apps } = data;

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
      <ViewHeader
        title="Domains"
        actions={
          canWrite ? (
            <CreateDialog trigger="Add domain" title="Add a sending domain">
              {(done) => <NewDomainForm done={done} />}
            </CreateDialog>
          ) : undefined
        }
      />
      <ResourceTable
        columns={[
          { header: "Domain", cell: (d) => <span className="font-mono text-xs">{d.domain}</span> },
          { header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
          { header: "DNS", cell: (d) => <DnsRecords records={d.records} /> },
          {
            header: "",
            cell: (d) =>
              canWrite ? (
                <Button variant="outline" size="sm" onClick={() => check(d.id)}>
                  Check now
                </Button>
              ) : null,
          },
        ]}
        rows={domains}
        rowKey={(d) => d.id}
        empty="No sending domains yet. Add one to send from your own address."
      />

      <div className="flex h-11 items-center justify-between gap-2 border-b border-t px-4">
        <h2 className="text-sm font-medium">Addresses</h2>
        {canWrite ? (
          <CreateDialog trigger="Add address" title="Add an address">
            {(done) => <NewAddressForm apps={apps} done={done} />}
          </CreateDialog>
        ) : null}
      </div>
      <ResourceTable
        columns={[
          { header: "Address", cell: (a) => <span className="font-mono text-xs">{a.email}</span> },
          { header: "App", cell: (a) => a.appName },
          { header: "Name", cell: (a) => a.displayName ?? "-" },
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
          {
            header: "",
            cell: (a) => (
              <div className="flex justify-end gap-2">
                {canManageMail && a.kind !== "sender" ? (
                  <Button variant="outline" size="sm" render={<Link to="/domains/addresses/$addressId" params={{ addressId: a.id }} />}>
                    Access
                  </Button>
                ) : null}
                {canWrite ? (
                  <ConfirmDialog
                    trigger="Remove"
                    title="Remove this address?"
                    description="Mail to it stops being received, and the app can no longer send from it."
                    confirmLabel="Remove address"
                    onConfirm={() => remove(a.id)}
                  />
                ) : null}
              </div>
            ),
          },
        ]}
        rows={addresses}
        rowKey={(a) => a.id}
        empty="No addresses yet. Add one on a verified domain to send from it."
      />
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
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="domain-name">Domain</Label>
      <Input
        id="domain-name"
        required
        placeholder="example.com"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        aria-describedby="domain-hint"
      />
      <p id="domain-hint" className="text-xs text-muted-foreground">
        Add the DNS records it shows, then press Check now.
      </p>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Add domain
        </Button>
      </div>
    </form>
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addAddressFn({ data: { appId, email, kind, displayName: name || undefined } });
      toast.success("Address added", { description: email });
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not add the address."));
    } finally {
      setPending(false);
    }
  }

  if (apps.length === 0) return <p className="text-sm text-muted-foreground">Create an app first. Addresses belong to an app.</p>;

  return (
    <form onSubmit={submit} className="grid gap-3">
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
        <SelectTrigger id="address-kind" className="w-full">
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
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !appId}>
          Add address
        </Button>
      </div>
    </form>
  );
}
