"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { authClient } from "@/lib/auth/client";

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function WorkspaceCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onName(v: string) {
    setName(v);
    setSlug(slugify(v));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const s = slug || slugify(name);
    if (!name.trim() || !s) {
      setError("Name is required.");
      return;
    }
    startTransition(async () => {
      const res = await authClient.organization.create({ name: name.trim(), slug: s });
      if (res.error) {
        setError(res.error.message ?? "Could not create workspace.");
        return;
      }
      const id = res.data?.id;
      if (id) {
        await authClient.organization.setActive({ organizationId: id });
      }
      // Empty workspace — land on Apps so the empty state can prompt the first app.
      router.push("/dashboard/tenants");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ws-name">Name</Label>
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Acme"
          autoComplete="organization"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ws-slug">Short name</Label>
        <Input
          id="ws-slug"
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          placeholder="acme"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
