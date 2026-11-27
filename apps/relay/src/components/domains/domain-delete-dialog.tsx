import { Checkbox } from "@foundry/ui/checkbox";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { deleteDomainFn, domainDeletePreview } from "../../console/domains.fns";
import { ConfirmDialog } from "../page/confirm-dialog";
import { DnsRecords } from "./dns-records";
import { useLoad } from "../lib/use-load";
import { Mono } from "../form/text";
import { confirmAction } from "../lib/run-action";

type Preview = Awaited<ReturnType<typeof domainDeletePreview>>;

// Counts load on open, so the operator sees what the delete touches before typing the name.
export function DomainDeleteDialog({
  id,
  domain,
  open: controlledOpen,
  onOpenChange,
}: {
  id: string;
  domain: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [deleteHistory, setDeleteHistory] = useState(false);

  useEffect(() => {
    if (open) return;
    setPreview(null);
    setDeleteHistory(false);
  }, [open]);
  useLoad(open ? () => domainDeletePreview({ data: { id } }) : null, [open, id], {
    onData: setPreview,
    onError: (copy) => {
      setOpen(false);
      toast.error(copy);
    },
    fallback: "Could not load the delete preview",
  });

  async function confirm() {
    let ownerCommand: string | null | undefined;
    await confirmAction(
      async () => {
        ({ ownerCommand } = await deleteDomainFn({ data: { id, confirm: domain, deleteHistory } }));
      },
      "Domain deleted",
      async () => {
        if (ownerCommand) toast("Delete the SES identity as the owner", { description: ownerCommand });
        await router.invalidate();
      },
    );
  }

  return (
    <ConfirmDialog
      trigger={controlledOpen === undefined ? "Delete" : undefined}
      title={`Delete ${domain}?`}
      description="Removes the domain, its addresses, their grants and inbound routing from Relay. Campaigns and automations sent from it are paused. Suppressions and audit records stay."
      confirmLabel="Delete domain"
      onConfirm={confirm}
      open={open}
      onOpenChange={setOpen}
      typed={domain}
      confirmDisabled={!preview}
    >
      <div className="flex flex-col gap-3 text-sm">
        {preview ? (
          <ul className="flex flex-col gap-1 tabular-nums">
            <li>
              Addresses: {preview.addresses.total} ({preview.addresses.senders} sending, {preview.addresses.inboxes} receiving)
            </li>
            <li>Address grants: {preview.grants}</li>
            <li>
              Campaigns: {preview.campaigns}, automations: {preview.automations} (paused, their From removed)
            </li>
            <li>Mail history: {preview.messages} messages{deleteHistory ? ", deleted with the domain" : ", kept"}</li>
          </ul>
        ) : (
          <p className="text-muted-foreground">Counting what this touches...</p>
        )}
        {preview && preview.dnsRecords.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span>DNS records to remove from your DNS host:</span>
            <DnsRecords records={preview.dnsRecords} />
          </div>
        ) : null}
        {preview && !preview.sesDelete ? (
          <p className="text-muted-foreground">
            Relay leaves the SES identity in place. Run this as the owner: <Mono>{preview.ownerCommand}</Mono>
          </p>
        ) : null}
        {preview?.protected ? (
          <p>This domain is protected. Mail sent from this domain stops when it is deleted.</p>
        ) : null}
        <Label className="font-normal">
          <Checkbox checked={deleteHistory} onCheckedChange={(on) => setDeleteHistory(on === true)} />
          Also delete mail history
        </Label>
      </div>
    </ConfirmDialog>
  );
}
