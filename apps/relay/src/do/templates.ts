import { newId } from "../shared/ids";
import { keysetBefore, keysetSlice, parseCursor } from "../core/cursor";
import { type TemplateView } from "../shared/views";
import { PAGE_SIZE } from "../shared/limits";

export type TemplateInput = Partial<Omit<TemplateView, "id" | "appId" | "createdAt" | "updatedAt">> & { name: string };
export type TemplateOverride = Pick<TemplateView, "event" | "locale" | "subject" | "intro" | "enabled">;
export type RenderedTemplate = { subject: string; html: string; text: string; hasUnsubscribe: boolean };

const COLUMNS = `id, app_id AS appId, name, event, locale, subject, intro, html, text, enabled,
  created_at AS createdAt, updated_at AS updatedAt`;

type Raw = Omit<TemplateView, "enabled"> & { enabled: number };
const view = (r: Raw): TemplateView => ({ ...r, enabled: r.enabled === 1 });

export function getTemplateRow(sql: SqlStorage, id: string): TemplateView | null {
  const row = sql.exec<Raw>(`SELECT ${COLUMNS} FROM template WHERE id = ?`, id).toArray()[0];
  return row ? view(row) : null;
}

function eventTaken(sql: SqlStorage, appId: string, event: string, locale: string, exceptId: string): boolean {
  return sql.exec("SELECT id FROM template WHERE app_id = ? AND event = ? AND locale = ? AND id != ?", appId, event, locale, exceptId).toArray().length > 0;
}

export function createTemplateRow(sql: SqlStorage, appId: string, input: TemplateInput): TemplateView | "event_taken" {
  const locale = input.locale ?? "en";
  if (input.event != null && eventTaken(sql, appId, input.event, locale, "")) return "event_taken";
  const id = newId("tpl");
  const now = Date.now();
  sql.exec(
    `INSERT INTO template (id, app_id, name, event, locale, subject, intro, html, text, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    appId,
    input.name,
    input.event ?? null,
    locale,
    input.subject ?? "",
    input.intro ?? null,
    input.html ?? "",
    input.text ?? "",
    (input.enabled ?? true) ? 1 : 0,
    now,
    now,
  );
  return getTemplateRow(sql, id)!;
}

export function listTemplateRows(sql: SqlStorage, cursor?: string, appId?: string): { rows: TemplateView[]; nextCursor: string | null } {
  const after = parseCursor(cursor);
  const where: string[] = [];
  const bindings: unknown[] = [];
  if (after) {
    const keyset = keysetBefore(after);
    where.push(keyset.sql);
    bindings.push(...keyset.bindings);
  }
  if (appId !== undefined) {
    where.push("app_id = ?");
    bindings.push(appId);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const fetched = sql
    .exec<Raw>(`SELECT ${COLUMNS} FROM template ${clause} ORDER BY created_at DESC, id DESC LIMIT ?`, ...bindings, PAGE_SIZE + 1)
    .toArray();
  const { page, nextCursor } = keysetSlice(fetched, PAGE_SIZE);
  return { rows: page.map(view), nextCursor };
}

export function updateTemplateRow(sql: SqlStorage, id: string, patch: Partial<TemplateInput>): TemplateView | "missing" | "event_taken" {
  const current = getTemplateRow(sql, id);
  if (!current) return "missing";
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next = { ...current, ...defined } as TemplateView;
  if (next.event !== null && eventTaken(sql, current.appId, next.event, next.locale, id)) return "event_taken";
  sql.exec(
    `UPDATE template SET name = ?, event = ?, locale = ?, subject = ?, intro = ?, html = ?, text = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    next.name,
    next.event,
    next.locale,
    next.subject,
    next.intro,
    next.html,
    next.text,
    next.enabled ? 1 : 0,
    Date.now(),
    id,
  );
  return getTemplateRow(sql, id)!;
}

// An automation names its template, so the template stays until the automation goes.
export function deleteTemplateRow(sql: SqlStorage, id: string): "deleted" | "missing" | "in_use" {
  if (sql.exec("SELECT id FROM template WHERE id = ?", id).toArray().length === 0) return "missing";
  if (sql.exec("SELECT id FROM automation WHERE template_id = ? LIMIT 1", id).toArray().length > 0) return "in_use";
  sql.exec("DELETE FROM template WHERE id = ?", id);
  return "deleted";
}

export function templateOverrideRows(sql: SqlStorage, appId: string): TemplateOverride[] {
  return sql
    .exec<Omit<TemplateOverride, "enabled"> & { enabled: number }>(
      "SELECT event, locale, subject, intro, enabled FROM template WHERE app_id = ? AND event IS NOT NULL ORDER BY created_at, id",
      appId,
    )
    .toArray()
    .map((r) => ({ ...r, enabled: r.enabled === 1 }));
}
