import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { ResourceTable } from "../../components/resource-table";
import { UnsavedGuard } from "../../components/unsaved-guard";
import { useCan } from "../../components/use-can";
import { ChoiceField } from "../../components/form/choice-field";
import { EmptyChoice } from "../../components/form/empty-choice";
import { useFieldErrors } from "../../components/form/field";
import { FixedField } from "../../components/form/fixed-field";
import { TextField } from "../../components/form/text-field";
import { DangerCard } from "../../components/page/danger-card";
import { EmptyState } from "../../components/page/empty-state";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { fetchAddresses, removeAddressFn, updateAddressFn } from "../../console/domains.fns";
import { addGrantFn, fetchAddressAccess, removeGrantFn } from "../../console/grants.fns";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";
import { KIND_LABEL, KINDS } from "../../lib/address-kinds";

export const Route = createFileRoute("/_app/domains_/addresses/$addressId")({
  loader: async ({ params }) => {
    const addresses = await fetchAddresses();
    if (!addresses) return null;
    const address = addresses.find((a) => a.id === params.addressId);
    if (!address) return { address: null, access: null };
    const access = address.kind === "sender" ? null : await fetchAddressAccess({ data: { addressId: address.id } });
    return { address, access };
  },
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Domains", to: "/domains" }, { label: "Address" }]} columns={2} />,
  component: AddressPage,
});

type Address = NonNullable<NonNullable<ReturnType<typeof Route.useLoaderData>>["address"]>;

function AddressPage() {
  const data = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const canWrite = useCan({ sending: ["write"] });
  const canManage = useCan({ mailbox: ["manage"] });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);
  const crumbs = [{ label: "Domains", to: "/domains" }, { label: "Address" }];
  if (!data || (!canWrite && !canManage)) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if (!data.address) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason="not-found" />
      </>
    );
  }
  const { address, access } = data;

  async function removeAccess(grantId: string) {
    await removeGrantFn({ data: { id: grantId } });
    toast.success("Access removed");
    await router.invalidate();
  }

  async function removeAddress() {
    await removeAddressFn({ data: { id: address.id } });
    toast.success("Address removed", { description: address.email });
    await navigate({ to: "/domains", search: { q: undefined, status: undefined } });
  }

  const granted = new Set((access?.grants ?? []).map((g) => `${g.kind}:${g.targetId}`));
  const options = [
    ...(access?.teams ?? []).map((t) => ({ value: `team:${t.id}`, label: t.label, badge: "Team" })),
    ...(access?.members ?? []).map((m) => ({ value: `member:${m.id}`, label: m.label, badge: "Member" })),
  ].filter((o) => !granted.has(o.value));

  return (
    <>
      <PageHeader crumbs={[{ label: "Domains", to: "/domains" }, { label: address.email }]} description="Settings for this address." />
      <div className="grid max-w-3xl gap-4 px-4 pb-8">
        <AddressDetailsCard address={address} canWrite={canWrite} />
        <SettingsCard title="Mail" description="What this address can do.">
          <FixedField
            label="Mail"
            value={KIND_LABEL[address.kind] ?? address.kind}
            hint={`${KINDS.find((k) => k.value === address.kind)?.hint ?? ""} Remove the address and add it again to change it.`.trim()}
          />
        </SettingsCard>
        <SettingsCard title="App" description="The app this address belongs to.">
          <FixedField label="App" value={address.appName} hint="Remove the address and add it again under another app." />
        </SettingsCard>
        {access ? (
          <SettingsCard
            title="Access"
            description="Owners and admins can read this address. Share it with a member or team."
            action={canManage ? <Button variant="outline" onClick={() => setAdding(true)}>Add access</Button> : undefined}
          >
            <ResourceTable
              columns={[
                { header: "Who", cell: (g) => g.label },
                { header: "Type", cell: (g) => (g.kind === "team" ? "Team" : "Member") },
              ]}
              rows={access.grants}
              rowKey={(g) => g.id}
              menu={(g) => [{ label: "Remove", hidden: !canManage, destructive: true, onSelect: () => setRemoving({ id: g.id, label: g.label }) }]}
              empty={<EmptyState icon={UsersIcon} title="No one has been given access" description="Share this address with a member or team." />}
            />
          </SettingsCard>
        ) : null}
        {canWrite ? (
          <DangerCard
            title="Remove this address"
            description="Mail to it stops arriving, people lose access to it, and apps can no longer send from it."
            buttonLabel="Remove address"
            confirmTitle={`Remove ${address.email}?`}
            typed={address.email}
            onConfirm={removeAddress}
          />
        ) : null}
      </div>
      <CreateDialog title="Add access" open={adding} onOpenChange={setAdding}>
        {(done) => <NewGrantForm addressId={address.id} options={options} done={done} />}
      </CreateDialog>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove access for ${removing?.label ?? "this person or team"}?`}
        description={`${removing?.label ?? "They"} can no longer read mail sent to ${address.email}.`}
        confirmLabel="Remove access"
        onConfirm={async () => {
          if (removing) await removeAccess(removing.id);
        }}
      />
    </>
  );
}

function AddressDetailsCard({ address, canWrite }: { address: Address; canWrite: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(address.displayName ?? "");
  const [replyTo, setReplyTo] = useState(address.replyTo ?? "");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = name.trim() !== (address.displayName ?? "") || replyTo.trim() !== (address.replyTo ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    const reply = replyTo.trim();
    if (reply && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply)) {
      setReplyError("Enter a valid email address or leave it blank.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await updateAddressFn({ data: { id: address.id, displayName: name.trim() || null, replyTo: reply || null } });
      toast.success("Address updated", { description: address.email });
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not update the address."));
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsCard
      title="General"
      footer={dirty ? "Unsaved changes" : "Name and reply-to are optional."}
      action={
        canWrite ? (
          <Button type="submit" variant="outline" form="address-details-form" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save address"}
          </Button>
        ) : undefined
      }
    >
      <FormBody id="address-details-form" onSubmit={save}>
        <UnsavedGuard when={dirty} />
        <FixedField label="Address" value={address.email} hint="Remove it and add a new one to change it." />
        <TextField id="edit-address-name" label="Name" hint="Shown to recipients as the sender name." maxLength={80} value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
        <TextField
          id="edit-address-reply-to"
          label="Reply-To"
          type="email"
          maxLength={254}
          value={replyTo}
          error={replyError}
          disabled={!canWrite}
          onClearError={() => setReplyError(null)}
          onChange={(e) => setReplyTo(e.target.value)}
        />
        <FormError message={error} />
      </FormBody>
    </SettingsCard>
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
  const fe = useFieldErrors<"who">();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!choice) {
      fe.set({ who: "Choose a person or team." });
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

  if (options.length === 0) {
    return (
      <EmptyChoice
        id="grant-who"
        label="Member or team"
        message="Everyone in this workspace already has access."
        to="/settings/invites"
        search={{ new: 1 }}
        linkLabel="Invite a member"
        onNavigate={done}
      />
    );
  }

  return (
    <FormBody onSubmit={submit}>
      <ChoiceField id="grant-who" label="Member or team" value={choice} onChange={setChoice} options={options} people autoFocus error={fe.errors.who} onClearError={() => fe.clear("who")} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Give access" pending={pending} pendingLabel="Giving access…" />
    </FormBody>
  );
}
