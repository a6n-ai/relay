"use client";

import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foundry/ui/select";

export const CONSENT_SOURCES = [
  { value: "purchase", label: "Customer purchased" },
  { value: "express_optin", label: "They asked to hear from us" },
  { value: "event_signup", label: "Signed up at an event" },
  { value: "import_other", label: "Imported" },
] as const;

export interface ListMeta {
  name: string;
  consentSource: string;
  consentNote: string;
}

/**
 * Name + consent provenance, shared by both ways of building a list (CSV
 * import, manual entry). Asked up front rather than after the contacts,
 * because it's a property of how the list was gathered, not an afterthought.
 */
export function ContactListMetaFields({
  meta,
  onChange,
}: {
  meta: ListMeta;
  onChange: (next: ListMeta) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="listName">Group name</Label>
          <Input
            id="listName"
            value={meta.name}
            onChange={(e) => onChange({ ...meta, name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>How was consent obtained?</Label>
          <Select
            value={meta.consentSource}
            onValueChange={(v) => onChange({ ...meta, consentSource: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONSENT_SOURCES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="consentNote">How they agreed</Label>
        <Input
          id="consentNote"
          value={meta.consentNote}
          onChange={(e) => onChange({ ...meta, consentNote: e.target.value })}
          placeholder="Where and when these people agreed to hear from you"
        />
        <p className="text-xs text-muted-foreground">
          Consent after a purchase lasts 24 months. Don’t import people you can’t explain.
        </p>
      </div>
    </>
  );
}
