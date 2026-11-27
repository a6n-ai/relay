import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { type FormEvent, type RefObject, useRef, useState } from "react";
import { confirmAction } from "../../components/lib/run-action";
import { ConfirmDialog } from "../../components/page/confirm-dialog";
import { CreateDialog } from "../../components/page/create-dialog";
import { PageDenied } from "../../components/page/page-denied";
import { ResourceTable } from "../../components/page/resource-table";
import { useCan } from "../../components/lib/use-can";
import { ChoiceField } from "../../components/form/choice-field";
import { EmptyChoice } from "../../components/form/empty-choice";
import { useFieldErrors } from "../../components/form/field";
import { FixedField } from "../../components/form/fixed-field";
import { NameField, TextField } from "../../components/form/text-field";
import { DangerCard } from "../../components/page/danger-card";
import { EmptyState } from "../../components/page/empty-state";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { SettingsCard, SettingsForm } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { fetchAddresses, fetchDomains, removeAddressFn, updateAddressFn } from "../../console/domains.fns";
import { addGrantFn, fetchAddressAccess, removeGrantFn } from "../../console/grants.fns";
import { FormError, FormBody, FormActions, FormPanel } from "../../components/form/form-parts";
import { KIND_LABEL, KINDS } from "../../components/lib/address-kinds";
import { EMAIL_MAX } from "../../shared/limits";
import { emailSchema } from "../../shared/schemas";
import { useSubmit } from "../../components/lib/use-submit";

export const Route = createFileRoute("/_app/domains_/addresses/$addressId")({
  loader: async ({ params }) => {
    if (!(await fetchDomains())) return null;
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
  const router = useRouter();
  const navigate = useNavigate();
  const canWrite = useCan({ sending: ["write"] });
  const canManage = useCan({ mailbox: ["manage"] });
  const [adding, setAdding] = useState(false);
  const leaving = useRef(false);
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);
  const crumbs = [{ label: "Domains", to: "/domains" }, { label: "Address" }];
  if (!data || (!canWrite && !canManage)) {
    return <PageDenied crumbs={crumbs} />;
  }
  if (!data.address) {
    return <PageDenied crumbs={crumbs} reason="not-found" />;
  }
  const { address, access } = data;

  async function removeAccess(grantId: string) {
    await confirmAction(() => removeGrantFn({ data: { id: grantId } }), "Access removed", () => router.invalidate());
  }

  async function removeAddress() {
    await removeAddressFn({ data: { id: address.id } });
    leaving.current = true;
    toast.success("Address removed", { description: address.email });
    await navigate({ to: "/domains", search: { q: undefined, status: undefined } });
  }

  const granted = new Set((access?.grants ?? []).map((g) => `${g.kind}:${g.targetId}`));
  const options = [
    ...(access?.teams ?? []).map((t) => ({ value: `team:${t.id}`, label: t.label, badge: "Team" })),
    ...(access?.members ?? []).map((m) => ({ value: `member:${m.id}`, label: m.label })),
  ].filter((o) => !granted.has(o.value));

  return (
    <>
      <PageHeader crumbs={[{ label: "Domains", to: "/domains" }, { label: address.email }]} description="Settings for this address." />
      <FormPanel>
        <AddressDetailsCard key={address.id} address={address} canWrite={canWrite} bypass={leaving} />
        <SettingsCard title="Mail" description="What this address can do.">
          <FixedField
            hideLabel
            label="Mail"
            value={KIND_LABEL[address.kind] ?? address.kind}
            hint={`${KINDS.find((k) => k.value === address.kind)?.hint ?? ""} Remove the address and add it again to change it.`.trim()}
          />
        </SettingsCard>
        <SettingsCard title="App" description="The app this address belongs to.">
          <FixedField hideLabel label="App" value={address.appName} hint="Remove the address and add it again under another app." />
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
              menu={(g) => [{ label: "Remove access", hidden: !canManage, destructive: true, onSelect: () => setRemoving({ id: g.id, label: g.label }) }]}
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
      </FormPanel>
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

function AddressDetailsCard({ address, canWrite, bypass }: { address: Address; canWrite: boolean; bypass: RefObject<boolean> }) {
  const [name, setName] = useState(address.displayName ?? "");
  const [replyTo, setReplyTo] = useState(address.replyTo ?? "");
  const [replyError, setReplyError] = useState<string | null>(null);
  const { pending, error, run } = useSubmit();
  const dirty = name.trim() !== (address.displayName ?? "") || replyTo.trim() !== (address.replyTo ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    const reply = replyTo.trim();
    if (reply && !emailSchema.safeParse(reply).success) {
      setReplyError("Enter a valid email address or leave it blank.");
      return;
    }
    await run(async () => {
      await updateAddressFn({ data: { id: address.id, displayName: name.trim() || null, replyTo: reply || null } });
    }, "Could not update the address.", { success: "Address updated", description: address.email });
  }

  return (
    <SettingsForm
      title="General"
      hint="Name and reply-to are optional."
      dirty={dirty}
      pending={pending}
      saveLabel="Save address"
      canWrite={canWrite}
      bypass={bypass}
      onSubmit={save}
    >
      <FixedField label="Address" value={address.email} hint="Remove it and add a new one to change it." />
      <NameField required={false} id="edit-address-name" hint="Shown to recipients as the sender name." value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
      <TextField
        id="edit-address-reply-to"
        label="Reply-To"
        type="email"
        maxLength={EMAIL_MAX}
        value={replyTo}
        error={replyError}
        disabled={!canWrite}
        onClearError={() => setReplyError(null)}
        onChange={(e) => setReplyTo(e.target.value)}
      />
      <FormError message={error} />
    </SettingsForm>
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
  const [choice, setChoice] = useState(options.length === 1 ? options[0]!.value : "");
  const fe = useFieldErrors<"who">();
  const { pending, error, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!choice) {
      fe.set({ who: "Choose a person or team." });
      return;
    }
    const [kind, targetId] = choice.split(":");
    await run(async () => {
      await addGrantFn({ data: { addressId, ...(kind === "team" ? { teamId: targetId } : { memberId: targetId }) } });
    }, "Could not add access.", { success: "Access added", after: done });
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
      <FormActions cancel submitLabel="Add access" pending={pending} pendingLabel="Adding access…" />
    </FormBody>
  );
}
