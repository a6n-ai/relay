"use client";

import { useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { addTenantMailboxAction, addTenantSenderAction, issueTenantKeyAction, updateTenantQuotaAction } from "./actions";
import { defaultKindForNewMailbox, type MailboxKind } from "@/lib/mailbox/address-kinds";

export function UpdateQuotaForm({
  publicId,
  quota,
  seatQuota,
}: {
  publicId: string;
  quota: number;
  seatQuota: number;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex max-w-md flex-col gap-2"
      action={async (fd) => {
        setError(null);
        const result = await updateTenantQuotaAction(fd);
        if (result.error) setError(result.error);
      }}
    >
      <input type="hidden" name="publicId" value={publicId} />
      <label className="flex flex-col gap-1 text-sm">
        Monthly send limit
        <Input name="monthlyMessageQuota" type="number" min={0} defaultValue={quota} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Addresses allowed
        <Input name="mailboxSeatQuota" type="number" min={0} defaultValue={seatQuota} />
      </label>
      <p className="text-muted-foreground text-xs">0 means no cap.</p>
      <Button type="submit" size="sm">Save limits</Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}

export function IssueKeyForm({ publicId }: { publicId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      action={async (fd) => {
        setError(null);
        setSecret(null);
        const result = await issueTenantKeyAction(fd);
        if (result.error) setError(result.error);
        setSecret(result.secret ?? null);
      }}
    >
      <input type="hidden" name="publicId" value={publicId} />
      <label className="flex flex-col gap-1 text-sm">
        Key name
        <Input name="name" defaultValue="email" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="channels" value="email" defaultChecked />
        Email
      </label>
      <p className="text-muted-foreground text-xs">
        Text, WhatsApp, and in-app aren’t available on keys yet.
      </p>
      <Button type="submit" size="sm">Create access key</Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {secret ? (
        <p className="text-sm">
          Copy now; we don’t store the full secret: <code className="break-all">{secret}</code>
        </p>
      ) : null}
    </form>
  );
}

export function AddSenderForm({ publicId }: { publicId: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex max-w-xl flex-col gap-2 sm:flex-row"
      action={async (fd) => {
        setError(null);
        const result = await addTenantSenderAction(fd);
        if (result.error) setError(result.error);
      }}
    >
      <input type="hidden" name="publicId" value={publicId} />
      <Input name="email" type="email" required placeholder="info@tiffingrab.ca" />
      <Input name="displayName" placeholder="Tiffin Grab" />
      <Button type="submit" size="sm">Add From address</Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}

const MAILBOX_KINDS: { id: MailboxKind; label: string }[] = [
  { id: "send_as", label: "Send as" },
  { id: "relay_inbox", label: "Relay inbox" },
  { id: "people_inbox", label: "People inbox" },
];

export function AddMailboxForm({
  publicId,
  domains,
}: {
  publicId: string;
  domains: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [localPart, setLocalPart] = useState("");
  const [kind, setKind] = useState<MailboxKind>("relay_inbox");

  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      action={async (fd) => {
        setError(null);
        const result = await addTenantMailboxAction(fd);
        if (result.error) setError(result.error);
      }}
    >
      <input type="hidden" name="publicId" value={publicId} />
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input
          name="localPart"
          value={localPart}
          onChange={(e) => {
            const next = e.target.value;
            setLocalPart(next);
            setKind(defaultKindForNewMailbox(next));
          }}
          placeholder="support"
          required
        />
      </label>
      {kind === "people_inbox" ? (
        <label className="flex flex-col gap-1 text-sm">
          People domain
          <Input name="domain" placeholder="mail.example.com" required />
        </label>
      ) : domains.length > 0 ? (
        <label className="flex flex-col gap-1 text-sm">
          Domain
          <select name="domain" className="border-input bg-background h-9 w-full border px-3 text-sm" required>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-muted-foreground text-sm">Prove a sending domain first for Send as and Relay inbox.</p>
      )}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm">Kind</legend>
        {MAILBOX_KINDS.map((k) => (
          <label key={k.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="kind"
              value={k.id}
              checked={kind === k.id}
              onChange={() => setKind(k.id)}
            />
            {k.label}
          </label>
        ))}
      </fieldset>
      <p className="text-muted-foreground text-xs">
        People inbox needs a domain Relay does not send receipts from. One store per address.
      </p>
      <Button type="submit" size="sm" disabled={kind !== "people_inbox" && domains.length === 0}>
        Add address
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}
