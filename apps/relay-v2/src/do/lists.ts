import { newId } from "../lib/ids";
import { decodeCursor, encodeCursor } from "./console-reads";

export type ConsentSource = "purchase" | "express_optin" | "event_signup" | "import_other";
export type MemberState = "subscribed" | "suppressed";

export type ListInput = { name: string; consentSource: ConsentSource; consentNote?: string };
export type MemberInput = { email: string; firstName?: string; lastName?: string; consentAt?: number };

export type ListView = {
  id: string;
  appId: string;
  name: string;
  consentSource: ConsentSource;
  consentNote: string | null;
  members: number;
  createdAt: number;
};

export type MemberView = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  source: "manual" | "import";
  consentAt: number;
  state: MemberState;
  optedOut: string[];
  createdAt: number;
};

const PAGE = 50;
export const EXPORT_PAGE = 1000;

// One query per page: the brand domains each address opted out of, sorted.
function optedOutByEmail(sql: SqlStorage, emails: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (emails.length === 0) return out;
  const rows = sql
    .exec<{ email: string; domains: string }>(
      "SELECT email, json_group_array(domain) AS domains FROM marketing_optout WHERE email IN (SELECT value FROM json_each(?)) GROUP BY email",
      JSON.stringify(emails),
    )
    .toArray();
  for (const r of rows) out.set(r.email, (JSON.parse(r.domains) as string[]).sort());
  return out;
}

// The member count is one LEFT JOIN, so a page of lists costs one query.
function listViews(sql: SqlStorage, where: string, bindings: unknown[]): ListView[] {
  return sql
    .exec<ListView>(
      `SELECT l.id, l.app_id AS appId, l.name, l.consent_source AS consentSource, l.consent_note AS consentNote,
              l.created_at AS createdAt, COUNT(m.id) AS members
       FROM contact_list l LEFT JOIN contact_list_member m ON m.list_id = l.id
       ${where} GROUP BY l.id ORDER BY l.created_at DESC, l.id DESC`,
      ...bindings,
    )
    .toArray();
}

export function listListRows(sql: SqlStorage, appId?: string): ListView[] {
  return appId === undefined ? listViews(sql, "", []) : listViews(sql, "WHERE l.app_id = ?", [appId]);
}

export function createListRow(sql: SqlStorage, appId: string, input: ListInput): ListView {
  const id = newId("ctl");
  const now = Date.now();
  sql.exec(
    "INSERT INTO contact_list (id, app_id, name, consent_source, consent_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    appId,
    input.name,
    input.consentSource,
    input.consentNote || null,
    now,
    now,
  );
  return listViews(sql, "WHERE l.id = ?", [id])[0];
}

export function updateListRow(sql: SqlStorage, id: string, patch: Partial<ListInput>): ListView | null {
  const current = listViews(sql, "WHERE l.id = ?", [id])[0];
  if (!current) return null;
  sql.exec(
    "UPDATE contact_list SET name = ?, consent_source = ?, consent_note = ?, updated_at = ? WHERE id = ?",
    patch.name ?? current.name,
    patch.consentSource ?? current.consentSource,
    patch.consentNote !== undefined ? patch.consentNote || null : current.consentNote,
    Date.now(),
    id,
  );
  return listViews(sql, "WHERE l.id = ?", [id])[0];
}

// A scheduled, sending or paused campaign still needs its audience, so its lists cannot go.
export function deleteListRow(sql: SqlStorage, id: string): "deleted" | "missing" | "in_use" {
  if (sql.exec("SELECT id FROM contact_list WHERE id = ?", id).toArray().length === 0) return "missing";
  const busy = sql
    .exec(
      "SELECT c.id FROM campaign c, json_each(c.list_ids) j WHERE c.status IN ('scheduled', 'sending', 'paused') AND j.value = ? LIMIT 1",
      id,
    )
    .toArray();
  if (busy.length > 0) return "in_use";
  sql.exec("DELETE FROM contact_list_member WHERE list_id = ?", id);
  sql.exec("DELETE FROM contact_list WHERE id = ?", id);
  return "deleted";
}

type MemberRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  source: "manual" | "import";
  consentAt: number;
  createdAt: number;
};

export function listMemberRows(
  sql: SqlStorage,
  listId: string,
  isSuppressed: (email: string) => boolean,
  cursor?: string,
): { rows: MemberView[]; nextCursor: string | null } | null {
  const after = cursor === undefined ? null : decodeCursor(cursor);
  if (cursor !== undefined && !after) throw new Error("invalid cursor");
  if (sql.exec("SELECT id FROM contact_list WHERE id = ?", listId).toArray().length === 0) return null;
  const keyset = after ? "AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))" : "";
  const keysetBindings = after ? [after.createdAt, after.createdAt, after.id] : [];
  const fetched = sql
    .exec<MemberRow>(
      `SELECT m.id, m.email, m.first_name AS firstName, m.last_name AS lastName, m.source,
              m.consent_at AS consentAt, m.created_at AS createdAt
       FROM contact_list_member m
       WHERE m.list_id = ? ${keyset}
       ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
      listId,
      ...keysetBindings,
      PAGE + 1,
    )
    .toArray();
  const page = fetched.slice(0, PAGE);
  const last = page[page.length - 1];
  const optedOut = optedOutByEmail(sql, page.map((r) => r.email));
  const rows: MemberView[] = page.map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    source: r.source,
    consentAt: r.consentAt,
    state: isSuppressed(r.email) ? "suppressed" : "subscribed",
    optedOut: optedOut.get(r.email) ?? [],
    createdAt: r.createdAt,
  }));
  return { rows, nextCursor: fetched.length > PAGE && last ? encodeCursor(last.createdAt, last.id) : null };
}

// Keyset on email, so a resumed export never repeats or skips an address.
export function exportMemberRows(
  sql: SqlStorage,
  listId: string,
  isSuppressed: (email: string) => boolean,
  afterEmail: string | null,
): { rows: MemberView[]; next: string | null } | null {
  if (sql.exec("SELECT id FROM contact_list WHERE id = ?", listId).toArray().length === 0) return null;
  const fetched = sql
    .exec<MemberRow>(
      `SELECT m.id, m.email, m.first_name AS firstName, m.last_name AS lastName, m.source,
              m.consent_at AS consentAt, m.created_at AS createdAt
       FROM contact_list_member m
       WHERE m.list_id = ? AND (? IS NULL OR m.email > ?)
       ORDER BY m.email LIMIT ?`,
      listId,
      afterEmail,
      afterEmail,
      EXPORT_PAGE + 1,
    )
    .toArray();
  const page = fetched.slice(0, EXPORT_PAGE);
  const optedOut = optedOutByEmail(sql, page.map((r) => r.email));
  const rows: MemberView[] = page.map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    source: r.source,
    consentAt: r.consentAt,
    state: isSuppressed(r.email) ? "suppressed" : "subscribed",
    optedOut: optedOut.get(r.email) ?? [],
    createdAt: r.createdAt,
  }));
  return { rows, next: fetched.length > EXPORT_PAGE ? page[page.length - 1]!.email : null };
}

export function addMemberRow(
  sql: SqlStorage,
  listId: string,
  input: MemberInput,
  isSuppressed: (email: string) => boolean,
): "added" | "existing" | "suppressed" | "missing" {
  const list = sql.exec<{ app_id: string }>("SELECT app_id FROM contact_list WHERE id = ?", listId).toArray()[0];
  if (!list) return "missing";
  const email = input.email.trim().toLowerCase();
  if (isSuppressed(email)) return "suppressed";
  if (sql.exec("SELECT id FROM contact_list_member WHERE list_id = ? AND email = ?", listId, email).toArray().length > 0) return "existing";
  const now = Date.now();
  sql.exec(
    "INSERT INTO contact_list_member (id, list_id, app_id, email, first_name, last_name, source, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)",
    newId("clm"),
    listId,
    list.app_id,
    email,
    input.firstName || null,
    input.lastName || null,
    input.consentAt ?? now,
    now,
  );
  return "added";
}

export type ImportResult = { added: number; existing: number; suppressed: number };
export const IMPORT_CHUNK = 100;

// The unique index makes a repeat a no-op, so only a row that was inserted counts as added.
export function importMemberRow(
  sql: SqlStorage,
  listId: string,
  appId: string,
  input: MemberInput,
  isSuppressed: (email: string) => boolean,
): keyof ImportResult {
  const email = input.email.trim().toLowerCase();
  if (isSuppressed(email)) return "suppressed";
  const now = Date.now();
  const inserted = sql
    .exec(
      "INSERT INTO contact_list_member (id, list_id, app_id, email, first_name, last_name, source, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'import', ?, ?) ON CONFLICT (list_id, email) DO NOTHING RETURNING id",
      newId("clm"),
      listId,
      appId,
      email,
      input.firstName || null,
      input.lastName || null,
      input.consentAt ?? now,
      now,
    )
    .toArray();
  return inserted.length > 0 ? "added" : "existing";
}

export function removeMemberRow(sql: SqlStorage, listId: string, memberId: string): boolean {
  return sql.exec("DELETE FROM contact_list_member WHERE id = ? AND list_id = ? RETURNING id", memberId, listId).toArray().length > 0;
}
