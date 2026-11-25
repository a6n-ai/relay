import { newId } from "../lib/ids";
import type { ListInput } from "./lists";
import type { TemplateInput } from "./templates";

export type ImportIds = { created: number; existing: number; ids: Record<string, string> };
export type ImportRow<T> = T & { importRef: string };

export const IMPORT_TX_ROWS = 100;

// One transaction per chunk, so a failing row rolls back only its own chunk.
export function importInChunks<T>(
  storage: DurableObjectStorage,
  rows: ImportRow<T>[],
  insertOne: (row: ImportRow<T>) => { id: string; created: boolean },
): ImportIds {
  const total: ImportIds = { created: 0, existing: 0, ids: {} };
  for (let start = 0; start < rows.length; start += IMPORT_TX_ROWS) {
    storage.transactionSync(() => {
      for (const row of rows.slice(start, start + IMPORT_TX_ROWS)) {
        const { id, created } = insertOne(row);
        total.ids[row.importRef] = id;
        total[created ? "created" : "existing"] += 1;
      }
    });
  }
  return total;
}

type ImportTable = "contact_list" | "template" | "campaign";

// Called after an insert that hit the (app_id, import_ref) unique index, so the app's own row is the one held.
function existingImport(sql: SqlStorage, table: ImportTable, appId: string, ref: string): { id: string; created: false } {
  const hit = sql.exec<{ id: string }>(`SELECT id FROM ${table} WHERE app_id = ? AND import_ref = ?`, appId, ref).toArray()[0];
  if (!hit) throw new Error("import ref taken");
  return { id: hit.id, created: false };
}

export function importListRow(sql: SqlStorage, appId: string, row: ImportRow<ListInput>): { id: string; created: boolean } {
  const id = newId("ctl");
  const now = Date.now();
  const inserted = sql
    .exec(
      `INSERT INTO contact_list (id, app_id, name, consent_source, consent_note, import_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (app_id, import_ref) WHERE import_ref IS NOT NULL DO NOTHING RETURNING id`,
      id,
      appId,
      row.name,
      row.consentSource,
      row.consentNote || null,
      row.importRef,
      now,
      now,
    )
    .toArray();
  return inserted.length > 0 ? { id, created: true } : existingImport(sql, "contact_list", appId, row.importRef);
}

export function importTemplateRow(sql: SqlStorage, appId: string, row: ImportRow<TemplateInput>): { id: string; created: boolean } {
  const locale = row.locale ?? "en";
  // The same ref's own row is not a clash, so a repeat import reaches the conflict path and returns the existing id.
  if (
    row.event != null &&
    sql
      .exec("SELECT id FROM template WHERE app_id = ? AND event = ? AND locale = ? AND (import_ref IS NULL OR import_ref != ?)", appId, row.event, locale, row.importRef)
      .toArray().length > 0
  ) {
    throw new Error("template event taken");
  }
  const id = newId("tpl");
  const now = Date.now();
  const inserted = sql
    .exec(
      `INSERT INTO template (id, app_id, name, event, locale, subject, intro, html, text, enabled, import_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (app_id, import_ref) WHERE import_ref IS NOT NULL DO NOTHING RETURNING id`,
      id,
      appId,
      row.name,
      row.event ?? null,
      locale,
      row.subject ?? "",
      row.intro ?? null,
      row.html ?? "",
      row.text ?? "",
      (row.enabled ?? true) ? 1 : 0,
      row.importRef,
      now,
      now,
    )
    .toArray();
  return inserted.length > 0 ? { id, created: true } : existingImport(sql, "template", appId, row.importRef);
}

export type CampaignCounters = Partial<
  Record<"recipients" | "queued" | "sent" | "failed" | "suppressed" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "unsubscribed", number>
>;
export type ImportCampaignInput = {
  name: string;
  status: "draft" | "sent" | "cancelled";
  fromEmail: string | null;
  subject: string;
  html: string;
  text: string;
  listIds: string[];
  counters?: CampaignCounters;
};

// A copied campaign keeps its counters as given. A sent or cancelled one is never run, so nothing here schedules it or recounts it.
export function importCampaignRow(sql: SqlStorage, appId: string, row: ImportRow<ImportCampaignInput>): { id: string; created: boolean } {
  for (const listId of row.listIds) {
    if (sql.exec("SELECT id FROM contact_list WHERE id = ? AND app_id = ?", listId, appId).toArray().length === 0) throw new Error("bad list");
  }
  const c = row.counters ?? {};
  const id = newId("cmp");
  const now = Date.now();
  const inserted = sql
    .exec(
      `INSERT INTO campaign (id, app_id, name, status, from_email, subject, html, text, list_ids, import_ref, recipients,
         queued, sent, failed, suppressed, delivered, opened, clicked, bounced, complained, unsubscribed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (app_id, import_ref) WHERE import_ref IS NOT NULL DO NOTHING RETURNING id`,
      id,
      appId,
      row.name,
      row.status,
      row.fromEmail,
      row.subject,
      row.html,
      row.text,
      JSON.stringify(row.listIds),
      row.importRef,
      c.recipients ?? 0,
      c.queued ?? 0,
      c.sent ?? 0,
      c.failed ?? 0,
      c.suppressed ?? 0,
      c.delivered ?? 0,
      c.opened ?? 0,
      c.clicked ?? 0,
      c.bounced ?? 0,
      c.complained ?? 0,
      c.unsubscribed ?? 0,
      now,
      now,
    )
    .toArray();
  return inserted.length > 0 ? { id, created: true } : existingImport(sql, "campaign", appId, row.importRef);
}
