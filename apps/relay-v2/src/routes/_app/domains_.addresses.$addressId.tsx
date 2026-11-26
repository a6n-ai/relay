import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { ResourceTable } from "../../components/resource-table";
import { useCan } from "../../components/use-can";
import { ChoiceField } from "../../components/form/choice-field";
import { EmptyState } from "../../components/page/empty-state";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { Toolbar } from "../../components/page/toolbar";
import { PageHeader } from "../../components/shell/page-header";
import { addGrantFn, fetchAddressAccess, removeGrantFn } from "../../console/grants.fns";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";
import { Hint } from "../../components/page/text";

export const Route = createFileRoute("/_app/domains_/addresses/$addressId")({
  loader: ({ params }) => fetchAddressAccess({ data: { addressId: params.addressId } }),
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Domains", to: "/domains" }, { label: "Access" }]} columns={2} action />,
  component: AddressAccessPage,
});

function AddressAccessPage() {
  const data = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const canManage = useCan({ mailbox: ["manage"] });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);
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
    ...teams.map((t) => ({ value: `team:${t.id}`, label: t.label, badge: "Team" })),
    ...members.map((m) => ({ value: `member:${m.id}`, label: m.label, badge: "Member" })),
  ].filter((o) => !granted.has(o.value));

  async function remove(grantId: string) {
    await removeGrantFn({ data: { id: grantId } });
    toast.success("Access removed");
    await router.invalidate();
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
        menu={(g) => [{ label: "Remove", hidden: !canManage, destructive: true, onSelect: () => setRemoving({ id: g.id, label: g.label }) }]}
        empty={
          <EmptyState
            icon={UsersIcon}
            title="Owners and admins can read this address. Share it with a member or team."
            action={
              canManage ? (
                <Button variant="outline" onClick={() => setAdding(true)}>
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
        title={`Remove access for ${removing?.label ?? "this person or team"}?`}
        description={`${removing?.label ?? "They"} can no longer read mail sent to ${address.email}.`}
        confirmLabel="Remove access"
        onConfirm={async () => {
          if (removing) await remove(removing.id);
        }}
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
  options: { value: string; label: string; badge?: string }[];
  done: () => void;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(options.length === 1 ? options[0]!.value : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!choice) {
      setError("Choose a person or team.");
      return;
    }
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

  if (options.length === 0) return <Hint>Everyone in this workspace already has access.</Hint>;

  return (
    <FormBody onSubmit={submit}>
      <ChoiceField id="grant-who" label="Member or team" value={choice} onChange={setChoice} options={options} people autoFocus />
      <FormError message={error} />
      <FormActions cancel submitLabel="Give access" pending={pending} pendingLabel="Giving access…" />
    </FormBody>
  );
}
