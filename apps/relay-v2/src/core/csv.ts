import { memberInput } from "../console/schemas";
import type { MemberInput } from "../do/lists";

export type ParsedContacts = { rows: MemberInput[]; invalid: number; duplicates: number };

const MAX_RECORDS = 10_001; // header + 10,000 data rows
const CONSENT_DATE = /^\d{4}-\d{2}-\d{2}/;

// RFC 4180: quoted fields, "" escapes, CRLF or LF. Blank lines are dropped. An unterminated quote runs to end of file.
function records(text: string): string[][] {
  const out: string[][] = [];
  const push = (r: string[]) => {
    if (r.length === 1 && r[0].trim() === "") return;
    if (out.length === MAX_RECORDS) throw new Error("too many rows");
    out.push(r);
  };
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
      push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    push(row);
  }
  return out;
}

export function parseContactsCsv(text: string): ParsedContacts {
  const [header = [], ...body] = records(text);
  const columns = header.map((h) => h.trim().toLowerCase());
  const at = (name: string) => columns.indexOf(name);
  const emailAt = at("email");
  if (emailAt < 0) throw new Error("missing email column");
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
    // NaN fails memberInput's z.number(), so an unparseable or out-of-range date makes the row invalid.
    const consentText = cell(r, consentAt);
    const consent = consentText === "" ? undefined : CONSENT_DATE.test(consentText) ? Date.parse(consentText) : NaN;
    const parsed = memberInput.safeParse({
      email: cell(r, emailAt).toLowerCase(),
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      consentAt: consent,
    });
    if (!parsed.success) {
      invalid += 1;
      continue;
    }
    if (seen.has(parsed.data.email)) {
      duplicates += 1;
      continue;
    }
    seen.add(parsed.data.email);
    rows.push(parsed.data);
  }
  return { rows, invalid, duplicates };
}
