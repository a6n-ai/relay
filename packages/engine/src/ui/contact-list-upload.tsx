"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";
import { mapRows, parseCsv, looksLikeEmail, type RejectedRow } from "@relay/engine";
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
const PAGE_SIZE = 25;

const SAMPLE_CSV = "name,email,phone\nJane Doe,jane@example.com,+16135551234\nJohn Smith,john@example.com,+16135555678\n";
const SAMPLE_CSV_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

interface Row {
  id: number;
  name: string;
  email: string;
  phone: string;
  vars: Record<string, string>;
  reason: string | null; // null once valid (from the start, or fixed)
}

type FilterKey = "all" | "valid" | "invalid";

/**
 * Create a list, then import a CSV into it. Column mapping produces a preview
 * of every row — valid AND rejected — before anything is written. A rejected
 * row (bad email, missing name, duplicate) can be fixed inline rather than
 * only skipped: editing its email re-runs the same check that rejected it,
 * and a row that now passes is included automatically.
 */
export function ContactListUpload() {
  const router = useRouter();
  const [meta, setMeta] = useState<ListMeta>({ name: "", consentSource: "express_optin", consentNote: "" });
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ email?: string; phone?: string; name?: string }>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  async function pick(f: File | null) {
    setFile(f);
    setHeaders([]);
    setRows(null);
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
    const merged: Row[] = [
      ...out.valid.map((c, i) => ({ id: i, name: c.name, email: c.email ?? "", phone: c.phone ?? "", vars: c.vars, reason: null })),
      ...out.rejected.map((r: RejectedRow, i) => ({
        id: out.valid.length + i,
        name: r.name,
        email: r.email,
        phone: r.phone,
        vars: r.vars,
        reason: r.reason,
      })),
    ];
    setRows(merged);
    // Invalid rows start excluded — fixing one flips its reason to null, which
    // does not auto-include it back; the admin still checks the box, same as
    // any other row they're choosing to import.
    setExcluded(new Set(merged.filter((r) => r.reason).map((r) => r.id)));
    setFilter("all");
    setPage(0);
    if (out.rejected.length) toast.warning(`${out.rejected.length} row(s) need fixing before they can import`);
  }

  function updateEmail(id: number, email: string) {
    setRows((prev) =>
      prev
        ? prev.map((r) => {
            if (r.id !== id) return r;
            const ok = looksLikeEmail(email) || (!email && r.phone);
            return { ...r, email, reason: ok ? null : r.reason === "invalid email" || !r.reason ? "invalid email" : r.reason };
          })
        : prev,
    );
  }

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === "valid") return rows.filter((r) => !r.reason);
    if (filter === "invalid") return rows.filter((r) => r.reason);
    return rows;
  }, [rows, filter]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const validCount = rows?.filter((r) => !r.reason).length ?? 0;
  const invalidCount = rows?.filter((r) => r.reason).length ?? 0;
  const includedCount = rows?.filter((r) => !r.reason && !excluded.has(r.id)).length ?? 0;

  async function submit() {
    if (!meta.name.trim()) return toast.error("Name this group");
    if (!rows || includedCount === 0) return toast.error("Select at least one contact");

    setBusy(true);
    try {
      const contacts = rows
        .filter((r) => !r.reason && !excluded.has(r.id))
        .map((r) => ({ name: r.name, email: r.email || undefined, phone: r.phone || undefined }));
      const res = await createListWithContacts(meta, contacts);
      toast.success(`Imported ${res.imported}`);
      router.refresh();
      setMeta({ name: "", consentSource: "express_optin", consentNote: "" });
      setFile(null);
      setHeaders([]);
      setRows(null);
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  const columnSelect = (key: "email" | "phone" | "name", label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={mapping[key] ?? NONE}
        onValueChange={(v) => {
          setMapping((m) => ({ ...m, [key]: v === NONE ? undefined : v }));
          setRows(null);
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

      {headers.length > 0 && !rows && (
        <Button variant="outline" onClick={buildPreview}>
          Preview contacts
        </Button>
      )}

      {rows && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {(
                [
                  ["all", `All (${rows.length})`],
                  ["valid", `Valid (${validCount})`],
                  ["invalid", `Invalid (${invalidCount})`],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  onClick={() => {
                    setFilter(key);
                    setPage(0);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{includedCount} selected to import</span>
          </div>

          <ul className="divide-y rounded-md border">
            {pageRows.map((r) => (
              <li key={r.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  disabled={!!r.reason}
                  checked={!r.reason && !excluded.has(r.id)}
                  onChange={(e) =>
                    setExcluded((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {r.reason ? (
                      <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />
                    ) : (
                      <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
                    )}
                    <span className="truncate font-medium">{r.name || "(no name)"}</span>
                  </div>
                  {r.reason && r.reason !== "invalid email" ? (
                    <p className="mt-0.5 text-xs text-destructive">{r.reason}</p>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        value={r.email}
                        onChange={(e) => updateEmail(r.id, e.target.value)}
                        placeholder="email@example.com"
                        className="h-7 max-w-xs text-xs"
                      />
                      {r.phone && <span className="text-xs text-muted-foreground">{r.phone}</span>}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {pageRows.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No rows match this filter.</li>
            )}
          </ul>

          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {pageCount}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      <Button onClick={submit} disabled={busy || !rows}>
        {busy ? "Importing…" : rows ? `Import ${includedCount} contacts` : "Preview contacts first"}
      </Button>
    </div>
  );
}
