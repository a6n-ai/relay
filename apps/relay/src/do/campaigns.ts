import { brandDomain, IMPLIED_CONSENT_MS } from "../core/campaigns";
import { newId } from "../shared/ids";
import { decodeCursor, encodeCursor } from "./console-reads";
import { getTemplateRow } from "./templates";
import { RelayError } from "../shared/errors";
import { type CampaignView, type AudiencePreview, type CampaignStats } from "../shared/views";
import { PAGE_SIZE } from "../shared/limits";

export type CampaignSummary = Omit<CampaignView, "html" | "text">;
export type CampaignPatch = Partial<Pick<CampaignView, "name" | "fromEmail" | "subject" | "html" | "text" | "listIds" | "audienceKind" | "audienceQuery">>;

const SUMMARY_COLUMNS = `id, app_id AS appId, name, status, from_email AS fromEmail, subject, list_ids AS listIds, audience_kind AS audienceKind, audience_query AS audienceQuery,
  scheduled_at AS scheduledAt, run_seq AS runSeq, started_at AS startedAt, finished_at AS finishedAt, recipients, error,
  created_at AS createdAt, updated_at AS updatedAt`;
const VIEW_COLUMNS = `${SUMMARY_COLUMNS}, html, text`;

type Raw<T> = Omit<T, "listIds"> & { listIds: string };

function parse<T extends { listIds: string }>(r: T): Omit<T, "listIds"> & { listIds: string[] } {
  return { ...r, listIds: JSON.parse(r.listIds) as string[] };
}

// Distinct subscribed emails across the lists. A purchase-sourced row older than the implied-consent window does not count.
export function recipientQuery(): string {
  return `SELECT m.email AS email, max(m.first_name) AS firstName, max(m.last_name) AS lastName
    FROM contact_list_member m JOIN contact_list l ON l.id = m.list_id
    WHERE m.app_id = ? AND m.list_id IN (SELECT value FROM json_each(?))
      AND NOT (l.consent_source = 'purchase' AND m.consent_at < ?)
    GROUP BY m.email ORDER BY m.email`;
}

export type CampaignCounter =
  | "queued"
  | "sent"
  | "failed"
  | "suppressed"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "unsubscribed";

// Column names come from the typed union above, so the interpolation is never user input.
// Call inside the caller's transactionSync: the counter moves with the message it counts.
export function bumpCampaign(sql: SqlStorage, campaignId: string | null, delta: Partial<Record<CampaignCounter, number>>): void {
  const entries = Object.entries(delta).filter(([, n]) => n);
  if (!campaignId || entries.length === 0) return;
  sql.exec(
    `UPDATE campaign SET ${entries.map(([col]) => `${col} = ${col} + ?`).join(", ")} WHERE id = ?`,
    ...entries.map(([, n]) => n),
    campaignId,
  );
}


export function statsOf(s: Omit<CampaignStats, "total">): CampaignStats {
  return { ...s, total: s.queued + s.sent + s.failed + s.suppressed };
}

// Reads the counter columns only: the stats path never counts message rows.
export function campaignStatsRow(sql: SqlStorage, id: string): CampaignStats | null {
  const row = sql
    .exec<Omit<CampaignStats, "total">>(
      "SELECT queued, sent, failed, suppressed, delivered, opened, clicked, bounced, complained, unsubscribed FROM campaign WHERE id = ?",
      id,
    )
    .toArray()[0];
  return row ? statsOf(row) : null;
}

// The template's content is copied, so a later template edit never changes a campaign.
export function createCampaignRow(
  sql: SqlStorage,
  appId: string,
  name: string,
  templateId?: string,
  audience?: { audienceKind: "lists" | "hook"; audienceQuery: string | null },
): CampaignView | "missing" {
  const tpl = templateId === undefined ? null : getTemplateRow(sql, templateId);
  if (templateId !== undefined && tpl?.appId !== appId) return "missing";
  const id = newId("cmp");
  const now = Date.now();
  sql.exec(
    "INSERT INTO campaign (id, app_id, name, subject, html, text, template_id, audience_kind, audience_query, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    appId,
    name,
    tpl?.subject ?? "",
    tpl?.html ?? "",
    tpl?.text ?? "",
    tpl?.id ?? null,
    audience?.audienceKind ?? "lists",
    audience?.audienceQuery ?? null,
    now,
    now,
  );
  return getCampaignRow(sql, id)!;
}

export function getCampaignRow(sql: SqlStorage, id: string): CampaignView | null {
  const row = sql.exec<Raw<CampaignView>>(`SELECT ${VIEW_COLUMNS} FROM campaign WHERE id = ?`, id).toArray()[0];
  return row ? (parse(row) as CampaignView) : null;
}

export function listCampaignRows(
  sql: SqlStorage,
  cursor?: string,
  appId?: string,
): { rows: CampaignSummary[]; nextCursor: string | null } {
  const after = cursor === undefined ? null : decodeCursor(cursor);
  if (cursor !== undefined && !after) throw new RelayError("invalid cursor");
  const where: string[] = [];
  const bindings: unknown[] = [];
  if (after) {
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    bindings.push(after.createdAt, after.createdAt, after.id);
  }
  if (appId !== undefined) {
    where.push("app_id = ?");
    bindings.push(appId);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const fetched = sql
    .exec<Raw<CampaignSummary>>(`SELECT ${SUMMARY_COLUMNS} FROM campaign ${clause} ORDER BY created_at DESC, id DESC LIMIT ?`, ...bindings, PAGE_SIZE + 1)
    .toArray();
  const page = fetched.slice(0, PAGE_SIZE).map((r) => parse(r) as CampaignSummary);
  const last = page[page.length - 1];
  return { rows: page, nextCursor: fetched.length > PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null };
}

export function updateCampaignRow(sql: SqlStorage, id: string, patch: CampaignPatch): CampaignView | "missing" | "not_draft" | "bad_list" {
  const current = getCampaignRow(sql, id);
  if (!current) return "missing";
  if (current.status !== "draft") return "not_draft";
  const audienceKind = patch.audienceKind ?? current.audienceKind;
  // A hook audience names no lists, so switching to it clears them.
  const listIds = audienceKind === "hook" ? [] : patch.listIds ? [...new Set(patch.listIds)] : current.listIds;
  if (patch.listIds && audienceKind === "lists") {
    const owned = sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM contact_list WHERE app_id = ? AND id IN (SELECT value FROM json_each(?))", current.appId, JSON.stringify(listIds))
      .one().n;
    if (owned !== listIds.length) return "bad_list";
  }
  sql.exec(
    "UPDATE campaign SET name = ?, from_email = ?, subject = ?, html = ?, text = ?, list_ids = ?, audience_kind = ?, audience_query = ?, updated_at = ? WHERE id = ?",
    patch.name ?? current.name,
    patch.fromEmail !== undefined ? patch.fromEmail : current.fromEmail,
    patch.subject ?? current.subject,
    patch.html ?? current.html,
    patch.text ?? current.text,
    JSON.stringify(listIds),
    audienceKind,
    patch.audienceQuery !== undefined ? patch.audienceQuery : current.audienceQuery,
    Date.now(),
    id,
  );
  return getCampaignRow(sql, id)!;
}

export function deleteCampaignRow(sql: SqlStorage, id: string): "deleted" | "missing" | "not_draft" {
  const row = sql.exec<{ status: string }>("SELECT status FROM campaign WHERE id = ?", id).toArray()[0];
  if (!row) return "missing";
  if (row.status !== "draft") return "not_draft";
  sql.exec("DELETE FROM campaign WHERE id = ?", id);
  return "deleted";
}

// shortcut: loads every opt-out on the sending domain, join against the audience once a domain has more than a few thousand.
export function previewAudienceRows(
  sql: SqlStorage,
  appId: string,
  listIds: string[],
  fromEmail: string | null,
  isSuppressed: (email: string) => boolean,
  now: number,
): AudiencePreview {
  const ids = JSON.stringify([...new Set(listIds)]);
  const members = sql
    .exec<{ n: number }>(
      "SELECT COUNT(DISTINCT email) AS n FROM contact_list_member WHERE app_id = ? AND list_id IN (SELECT value FROM json_each(?))",
      appId,
      ids,
    )
    .one().n;
  const eligible = sql.exec<{ email: string }>(recipientQuery(), appId, ids, now - IMPLIED_CONSENT_MS).toArray();
  // shortcut: one suppression lookup per eligible email; replace with a join if previews of very large lists hit DO CPU limits.
  const optedOut = new Set(
    fromEmail === null
      ? []
      : sql.exec<{ email: string }>("SELECT email FROM marketing_optout WHERE domain = ?", brandDomain(fromEmail)).toArray().map((r) => r.email),
  );
  const suppressed = eligible.filter((r) => isSuppressed(r.email) || optedOut.has(r.email)).length;
  return {
    members,
    suppressed,
    lapsed: members - eligible.length,
    sendable: Math.max(0, eligible.length - suppressed),
  };
}
