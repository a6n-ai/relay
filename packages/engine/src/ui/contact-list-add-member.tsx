"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { apiFetch } from "./api-fetch";

/** Add one contact to an existing list. For the whole-new-list case, see ContactListManualAdd. */
export function ContactListAddMember({ listPublicId }: { listPublicId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return toast.error("Enter a name");
    if (!email.trim() && !phone.trim()) return toast.error("Enter an email or phone");
    setSaving(true);
    try {
      await apiFetch(`/api/notifications/contact-lists/${listPublicId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contacts: [{ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined }],
        }),
      });
      toast.success("Contact added");
      setName("");
      setEmail("");
      setPhone("");
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="contact-name">Name</Label>
        <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-40" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-email">Email</Label>
        <Input id="contact-email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 w-48" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-phone">Phone</Label>
        <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 w-40" />
      </div>
      <Button size="sm" onClick={submit} disabled={saving}>
        {saving ? "Adding…" : "Add contact"}
      </Button>
    </div>
  );
}
