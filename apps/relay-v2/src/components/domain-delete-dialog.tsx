import { Checkbox } from "@foundry/ui/checkbox";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { deleteDomainFn, domainDeletePreview } from "../console/domains.fns";
import { ConfirmDialog } from "./confirm-dialog";
import { DnsRecords } from "./dns-records";
import { errorText } from "./error-text";

type Preview = Awaited<ReturnType<typeof domainDeletePreview>>;

// Counts load on open, so the operator sees what the delete touches before typing the name.
export function DomainDeleteDialog({ id, domain }: { id: string; domain: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState("");
  const [deleteHistory, setDeleteHistory] = useState(false);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      try {
        setPreview(await domainDeletePreview({ data: { id } }));
      } catch (err) {
        setOpen(false);
        toast.error(errorText(err, "Could not load the delete preview"));
      }
      return;
    }
    setPreview(null);
    setTyped("");
    setDeleteHistory(false);
  }

  async function confirm() {
    try {
      const { ownerCommand } = await deleteDomainFn({ data: { id, confirm: typed.trim(), deleteHistory } });
      toast.success("Domain deleted");
      if (ownerCommand) toast("Delete the SES identity as the owner", { description: ownerCommand });
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not delete the domain"));
    }
  }

  return (
    <ConfirmDialog
      trigger="Delete"
      title={`Delete ${domain}?`}
      description="Removes the domain, its addresses, their grants and inbound routing from Relay. Campaigns and automations sent from it are paused. Suppressions and audit records stay."
      confirmLabel="Delete domain"
      onConfirm={confirm}
      open={open}
      onOpenChange={onOpenChange}
      confirmDisabled={!preview || typed.trim() !== domain}
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
            Relay leaves the SES identity in place. Run this as the owner: <code className="font-mono text-xs">{preview.ownerCommand}</code>
          </p>
        ) : null}
        {preview?.protected ? (
          <p>This domain is protected. Sign-in codes and this workspace's mail stop when it is deleted.</p>
        ) : null}
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={deleteHistory} onCheckedChange={(on) => setDeleteHistory(on === true)} />
          Also delete mail history
        </Label>
        <Label className="flex flex-col items-start gap-1">
          Type {domain} to confirm
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </Label>
      </div>
    </ConfirmDialog>
  );
}
