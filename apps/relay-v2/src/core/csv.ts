import { z } from "zod";
import type { MemberInput } from "../do/lists";

export type ParsedContacts = { rows: MemberInput[]; invalid: number; duplicates: number };

const MAX_ROWS = 10_000;

// Same rule as send-input.ts (z.email()), without a zod schema so this file stays cheap to import anywhere.
function isEmail(email: string): boolean {
  return email.length <= 254 && z.regexes.email.test(email);
}

// RFC 4180: quoted fields, "" escapes, CRLF or LF. Blank lines are dropped.
function records(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function parseContactsCsv(text: string): ParsedContacts {
  const [header = [], ...body] = records(text);
  const columns = header.map((h) => h.trim().toLowerCase());
  const at = (name: string) => columns.indexOf(name);
  const emailAt = at("email");
  if (emailAt < 0) throw new Error("missing email column");
  if (body.length > MAX_ROWS) throw new Error("too many rows");
  const cell = (r: string[], i: number) => (i < 0 ? "" : (r[i] ?? "").trim());
  const firstAt = at("first_name");
  const lastAt = at("last_name");
  const nameAt = at("name");
  const consentAt = at("consent_at");

  const rows: MemberInput[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  for (const r of body) {
    const email = cell(r, emailAt).toLowerCase();
    if (!isEmail(email)) {
      invalid += 1;
      continue;
    }
    if (seen.has(email)) {
      duplicates += 1;
      continue;
    }
    seen.add(email);

    let firstName = cell(r, firstAt);
    let lastName = cell(r, lastAt);
    if (!firstName && !lastName && nameAt >= 0) {
      const full = cell(r, nameAt);
      const space = full.indexOf(" ");
      if (space < 0) firstName = full;
      else {
        firstName = full.slice(0, space);
        lastName = full.slice(space + 1).trim();
      }
    }
    const member: MemberInput = { email };
    if (firstName) member.firstName = firstName;
    if (lastName) member.lastName = lastName;
    const consent = Date.parse(cell(r, consentAt));
    if (!Number.isNaN(consent)) member.consentAt = consent;
    rows.push(member);
  }
  return { rows, invalid, duplicates };
}
