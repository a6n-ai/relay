"use client";

import { useState } from "react";
import { addSendingDomainAction, verifySendingDomainAction } from "./actions";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";

export function AddDomainForm({ slugs }: { slugs: string[] }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      action={async (formData) => {
        setError(null);
        const result = await addSendingDomainAction(formData);
        if (result.error) setError(result.error);
      }}
    >
      <select name="slug" className="border-input bg-background h-9 rounded-md border px-2 text-sm" required>
        {slugs.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <Input name="domain" required placeholder="tiffingrab.ca" />
      <Button type="submit">Add domain</Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}

export function VerifyDomainButton({ publicId }: { publicId: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={async (formData) => {
        setError(null);
        const result = await verifySendingDomainAction(formData);
        if (result.error) setError(result.error);
      }}
    >
      <input type="hidden" name="publicId" value={publicId} />
      <Button type="submit" size="sm" variant="outline">Check DNS</Button>
      {error ? <p className="text-destructive mt-1 text-xs">{error}</p> : null}
    </form>
  );
}
