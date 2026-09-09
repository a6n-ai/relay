"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { ContactListMetaFields, type ListMeta } from "./contact-list-meta-fields";
import { createListWithContacts, type ManualContactInput } from "./create-list-with-contacts";

const emptyRow = (): ManualContactInput => ({ name: "", email: "", phone: "" });

/** Build a list by typing contacts in one at a time — for the handful-of-people
 * case where exporting a spreadsheet first would be more work than the import. */
export function ContactListManualAdd() {
  const router = useRouter();
  const [meta, setMeta] = useState<ListMeta>({ name: "", consentSource: "express_optin", consentNote: "" });
  const [rows, setRows] = useState<ManualContactInput[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);

  function updateRow(i: number, patch: Partial<ManualContactInput>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function submit() {
    if (!meta.name.trim()) return toast.error("Name this group");
    const contacts = rows
      .map((r) => ({ name: r.name.trim(), email: r.email?.trim() || undefined, phone: r.phone?.trim() || undefined }))
      .filter((r) => r.name);
    if (contacts.length === 0) return toast.error("Add at least one contact");
    const missingContact = contacts.find((c) => !c.email && !c.phone);
    if (missingContact) return toast.error(`${missingContact.name} needs an email or phone`);

    setBusy(true);
    try {
      const res = await createListWithContacts(meta, contacts);
      toast.success(`Added ${res.imported} contact${res.imported === 1 ? "" : "s"}`);
      router.refresh();
      setMeta({ name: "", consentSource: "express_optin", consentNote: "" });
      setRows([emptyRow()]);
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <ContactListMetaFields meta={meta} onChange={setMeta} />

      <div className="space-y-2">
        <Label>Contacts</Label>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
            <Input
              placeholder="Name"
              value={row.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
            />
            <Input
              placeholder="Email"
              value={row.email}
              onChange={(e) => updateRow(i, { email: e.target.value })}
            />
            <Input
              placeholder="Phone"
              value={row.phone}
              onChange={(e) => updateRow(i, { phone: e.target.value })}
            />
            <Button
              variant="ghost"
              size="icon"
              disabled={rows.length === 1}
              onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, emptyRow()])}>
          <PlusIcon className="size-4" /> Add another
        </Button>
      </div>

      <Button onClick={submit} disabled={busy}>
        {busy ? "Creating…" : "Create list"}
      </Button>
    </div>
  );
}
