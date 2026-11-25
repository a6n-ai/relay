import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { ResourceTable } from "../../components/resource-table";
import { useCan } from "../../components/use-can";
import { EmptyState } from "../../components/page/empty-state";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { Toolbar } from "../../components/page/toolbar";
import { PageHeader } from "../../components/shell/page-header";
import { addGrantFn, fetchAddressAccess, removeGrantFn } from "../../console/grants.fns";

export const Route = createFileRoute("/_app/domains_/addresses/$addressId")({
  loader: ({ params }) => fetchAddressAccess({ data: { addressId: params.addressId } }),
  pendingComponent: () => <TableSkeleton columns={2} />,
  component: AddressAccessPage,
});

function AddressAccessPage() {
  const data = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const canManage = useCan({ mailbox: ["manage"] });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  if (!data) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Domains", to: "/domains" }, { label: "Access" }]} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const { address, grants, members, teams } = data;
  const granted = new Set(grants.map((g) => `${g.kind}:${g.targetId}`));
  const options = [
    ...members.map((m) => ({ value: `member:${m.id}`, label: `${m.label} (member)` })),
    ...teams.map((t) => ({ value: `team:${t.id}`, label: `${t.label} (team)` })),
  ].filter((o) => !granted.has(o.value));

  async function remove(grantId: string) {
    try {
      await removeGrantFn({ data: { id: grantId } });
      toast.success("Access removed");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not remove access"));
    }
  }

  return (
    <>
      <PageHeader crumbs={[{ label: "Domains", to: "/domains" }, { label: address.email }]} />
      <Toolbar>
        {canManage ? (
          <CreateDialog trigger="Add access" title="Give access to this address" open={adding} onOpenChange={setAdding}>
            {(done) => <NewGrantForm addressId={address.id} options={options} done={done} />}
          </CreateDialog>
        ) : null}
      </Toolbar>
      <ResourceTable
        columns={[
          { header: "Who", cell: (g) => g.label },
          { header: "Type", cell: (g) => (g.kind === "team" ? "Team" : "Member") },
        ]}
        rows={grants}
        rowKey={(g) => g.id}
        menu={(g) => [{ label: "Remove", hidden: !canManage, destructive: true, onSelect: () => setRemoving(g.id) }]}
        empty={
          <EmptyState
            icon={UsersIcon}
            title="Owners and admins can read this address. Share it with a member or team."
            action={
              canManage ? (
                <Button size="sm" className="rounded-full" onClick={() => setAdding(true)}>
                  Add access
                </Button>
              ) : undefined
            }
          />
        }
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this access?"
        description="This person or team can no longer read mail sent to this address."
        confirmLabel="Remove access"
        onConfirm={() => removing && remove(removing)}
      />
    </>
  );
}

function NewGrantForm({
  addressId,
  options,
  done,
}: {
  addressId: string;
  options: { value: string; label: string }[];
  done: () => void;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const [kind, targetId] = choice.split(":");
    try {
      await addGrantFn({ data: { addressId, ...(kind === "team" ? { teamId: targetId } : { memberId: targetId }) } });
      toast.success("Access added");
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not add access."));
    } finally {
      setPending(false);
    }
  }

  if (options.length === 0) return <p className="text-sm text-muted-foreground">Everyone in this workspace already has access.</p>;

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="grant-who">Member or team</Label>
      <Select value={choice} onValueChange={setChoice}>
        <SelectTrigger id="grant-who" className="w-full">
          <SelectValue placeholder="Choose who" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !choice}>
          Give access
        </Button>
      </div>
    </form>
  );
}
