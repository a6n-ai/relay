"use client";

import { useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { addTenantSenderAction, issueTenantKeyAction, updateTenantQuotaAction } from "./actions";

export function UpdateQuotaForm({ publicId, quota }: { publicId: string; quota: number }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end"
      action={async (fd) => {
        setError(null);
        const result = await updateTenantQuotaAction(fd);
        if (result.error) setError(result.error);
      }}
    >
      <input type="hidden" name="publicId" value={publicId} />
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Monthly send limit
        <Input name="monthlyMessageQuota" type="number" min={0} defaultValue={quota} />
      </label>
      <Button type="submit" size="sm">Save limit</Button>
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
