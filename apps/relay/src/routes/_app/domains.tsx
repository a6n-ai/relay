import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { GlobeIcon } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { DnsRecords } from "../../components/dns-records";
import { DomainDeleteDialog } from "../../components/domain-delete-dialog";
import { errorText } from "../../components/error-text";
import { ResourceTable } from "../../components/resource-table";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { EmptyState } from "../../components/page/empty-state";
import { FilterMenu } from "../../components/page/filter-menu";
import { FormPanel } from "../../components/page/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { ResourceGrid } from "../../components/page/resource-grid";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ViewToggle } from "../../components/page/view-toggle";
import { type View, viewPref } from "../../components/page/view-pref";
import { PageHeader } from "../../components/shell/page-header";
import {
  checkDomainFn,
  fetchAddresses,
  fetchDomains,
  releaseDomainFn,
  removeAddressFn,
  setDomainProtectedFn,
} from "../../console/domains.fns";
import { Hint, Mono } from "../../components/page/text";
import { KIND_LABEL } from "../../lib/address-kinds";

export const Route = createFileRoute("/_app/domains")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    status: search.status === "verified" || search.status === "pending" || search.status === "failed" ? search.status : undefined,
  }),
  loader: async () => {
    const domains = await fetchDomains();
    if (!domains) return null;
    return { domains, addresses: await fetchAddresses() };
  },
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Domains" }]} columns={3} sections={["Domains", "Addresses"]} search filter view action />,
  component: DomainsPage,
});

const STATUS_FACET = {
  key: "status",
  label: "Status",
  options: [
    { value: "verified", label: "Verified" },
    { value: "pending", label: "Pending" },
    { value: "failed", label: "Failed" },
  ],
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
  const canWrite = useCan({ sending: ["write"] });
  const canManageMail = useCan({ mailbox: ["manage"] });
  const [releasing, setReleasing] = useState<{ id: string; domain: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; domain: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; email: string } | null>(null);
  const crumbs = [{ label: "Domains" }];
  if (!data) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const needle = q.trim().toLowerCase();
  const domains = data.domains.filter(
    (d) => (!needle || d.domain.toLowerCase().includes(needle)) && (!search.status || d.status === search.status),
  );
  const addressCount = new Map<string, number>();
  for (const a of data.addresses) {
    const d = a.email.slice(a.email.lastIndexOf("@") + 1);
    addressCount.set(d, (addressCount.get(d) ?? 0) + 1);
  }
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
      title="No domains yet"
      description="Add a domain to send from your own address."
      action={
        canWrite ? (
          <Button variant="outline" render={<Link to="/domains/new" />}>
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
          <Button variant="outline" render={<Link to="/domains/addresses/new" search={{ appId: scopeParam }} />}>
            Add address
          </Button>
        ) : null}
        {canWrite ? <Button render={<Link to="/domains/new" />}>Add domain</Button> : null}
      </Toolbar>

      <FormPanel className="max-w-none">
      {view === "grid" ? (
        <section className="-mx-4">
        <h2 className="px-4 pb-2 text-base font-semibold">Domains</h2>
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
        </section>
      ) : (
        <SettingsCard title="Domains" description="Domains you send from and receive on.">
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
            { header: "DNS", secondary: true, cell: (d) => <DnsRecords records={d.records} /> },
          ]}
          rows={domains}
          rowKey={(d) => d.id}
          menu={domainMenu}
          empty={domainsEmpty}
        />
        </SettingsCard>
      )}

      <SettingsCard title="Addresses" description="The addresses on those domains.">
      <ResourceTable
        columns={[
          {
            header: "Address",
            cell: (a) =>
              canWrite || canManageMail ? (
                <Link to="/domains/addresses/$addressId" params={{ addressId: a.id }} className="font-mono text-xs hover:underline">
                  {a.email}
                </Link>
              ) : (
                <Mono>{a.email}</Mono>
              ),
          },
          { header: "App", secondary: true, cell: (a) => a.appName },
          { header: "Name", secondary: true, cell: (a) => a.displayName ?? "—" },
          { header: "Reply-To", secondary: true, cell: (a) => a.replyTo ?? "—" },
          { header: "Mail", secondary: true, cell: (a) => KIND_LABEL[a.kind] },
        ]}
        rows={addresses}
        rowKey={(a) => a.id}
        menu={(a) => [
          { label: "Edit", hidden: !(canWrite || canManageMail), to: "/domains/addresses/$addressId", params: { addressId: a.id } },
          { label: "Remove", hidden: !canWrite, destructive: true, onSelect: () => setRemoving({ id: a.id, email: a.email }) },
        ]}
        empty={needle ? "No addresses match your search." : "No addresses yet. Add one on a verified domain to send from it."}
      />
      </SettingsCard>
      </FormPanel>

      <ConfirmDialog
        open={releasing !== null}
        onOpenChange={(o) => !o && setReleasing(null)}
        title={`Release ${releasing?.domain ?? "this domain"}?`}
        description="The domain is removed from Relay and from the sending service. If you add it again, the DNS records change and you must update them."
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
    </>
  );
}
