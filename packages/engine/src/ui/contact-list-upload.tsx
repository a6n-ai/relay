"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mapRows, parseCsv, type ParsedContact } from "@relay/engine";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foundry/ui/select";
import { ContactListMetaFields, type ListMeta } from "./contact-list-meta-fields";
import { createListWithContacts } from "./create-list-with-contacts";

const NONE = "__none__";

const SAMPLE_CSV = "name,email,phone\nJane Doe,jane@example.com,+16135551234\nJohn Smith,john@example.com,+16135555678\n";
const SAMPLE_CSV_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

/**
 * Create a list, then import a CSV into it. Column mapping produces a preview
 * of every valid/rejected row before anything is written — everyone starts
 * selected, so unchecking is for excluding the odd row rather than the normal
 * path, but nothing is inserted the admin hasn't seen.
 */
export function ContactListUpload() {
  const router = useRouter();
  const [meta, setMeta] = useState<ListMeta>({ name: "", consentSource: "express_optin", consentNote: "" });
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ email?: string; phone?: string; name?: string }>({});
  const [preview, setPreview] = useState<{ valid: ParsedContact[]; rejected: { row: number; reason: string }[] } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  async function pick(f: File | null) {
    setFile(f);
    setHeaders([]);
    setPreview(null);
    if (!f) return;
    const text = await f.text();
    setRawText(text);
    const { headers: h } = parseCsv(text);
    setHeaders(h);
    setMapping({
      email: h.find((x) => /e-?mail/i.test(x)),
      phone: h.find((x) => /phone|mobile|cell/i.test(x)),
      name: h.find((x) => /name/i.test(x)),
    });
  }

  function buildPreview() {
    if (!mapping.name) return toast.error("Pick which column is name");
    if (!mapping.email && !mapping.phone) return toast.error("Pick which column is email or phone");
    const out = mapRows(parseCsv(rawText), mapping);
    setPreview(out);
    setSelected(new Set(out.valid.map((_, i) => i)));
    if (out.rejected.length) toast.warning(`${out.rejected.length} row(s) can't be imported — see below`);
  }

  async function submit() {
    if (!meta.name.trim()) return toast.error("Name this group");
    if (!preview || selected.size === 0) return toast.error("Select at least one contact");

    setBusy(true);
    try {
      const contacts = preview.valid.filter((_, i) => selected.has(i));
      const res = await createListWithContacts(meta, contacts);
      toast.success(`Imported ${res.imported}`);
      router.refresh();
      setMeta({ name: "", consentSource: "express_optin", consentNote: "" });
      setFile(null);
      setHeaders([]);
      setPreview(null);
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  const allSelected = useMemo(
    () => !!preview && preview.valid.length > 0 && selected.size === preview.valid.length,
    [preview, selected],
  );

  const columnSelect = (key: "email" | "phone" | "name", label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={mapping[key] ?? NONE}
        onValueChange={(v) => {
          setMapping((m) => ({ ...m, [key]: v === NONE ? undefined : v }));
          setPreview(null);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-5">
      <ContactListMetaFields meta={meta} onChange={setMeta} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="csv">Spreadsheet</Label>
          <a
            href={SAMPLE_CSV_HREF}
            download="contact-list-sample.csv"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Download a sample
          </a>
        </div>
        <Input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void pick(e.target.files?.[0] ?? null)}
        />
      </div>

      {headers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {columnSelect("email", "Email column")}
          {columnSelect("phone", "Phone column")}
          {columnSelect("name", "Name column")}
        </div>
      )}

      {headers.length > 0 && !preview && (
        <Button variant="outline" onClick={buildPreview}>
          Preview contacts
        </Button>
      )}

      {preview && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allSelected}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(preview.valid.map((_, i) => i)) : new Set())
                }
              />
              {selected.size} of {preview.valid.length} selected
            </label>
            {preview.rejected.length > 0 && (
              <span className="text-xs text-muted-foreground">{preview.rejected.length} row(s) skipped</span>
            )}
          </div>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
            {preview.valid.map((c, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.has(i)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{c.email ?? c.phone}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={submit} disabled={busy || !preview}>
        {busy ? "Importing…" : preview ? `Import ${selected.size} contacts` : "Preview contacts first"}
      </Button>
    </div>
  );
}
