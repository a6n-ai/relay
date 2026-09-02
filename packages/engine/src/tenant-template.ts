import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { interpolate } from "./interpolate";
import { pickTemplate, type TemplateRow } from "./template";
import type { TenantNotificationTables } from "./tenant-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

async function loadTenantRows(
  db: Db,
  tables: TenantNotificationTables,
  tenantId: bigint,
  event: string,
): Promise<TemplateRow[]> {
  const t = tables.notificationTemplate;
  return db
    .select({
      channel: t.channel,
      locale: t.locale,
      subject: t.subject,
      body: t.body,
      html: t.html,
      text: t.text,
      providerTemplateId: t.providerTemplateId,
      enabled: t.enabled,
    })
    .from(t)
    .where(and(eq(t.tenantId, tenantId), eq(t.event, event))) as unknown as Promise<TemplateRow[]>;
}

export async function renderEmailForTenantEvent(
  db: Db,
  tables: TenantNotificationTables,
  tenantId: bigint,
  event: string,
  locale: string,
  vars: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string } | null> {
  const t = pickTemplate(await loadTenantRows(db, tables, tenantId, event), "email", locale);
  if (!t || !t.html || !t.text) return null;
  return {
    subject: interpolate(t.subject, vars),
    html: interpolate(t.html, vars),
    text: interpolate(t.text, vars),
  };
}

export async function renderTextForTenantEvent(
  db: Db,
  tables: TenantNotificationTables,
  tenantId: bigint,
  event: string,
  channel: string,
  locale: string,
  vars: Record<string, unknown>,
): Promise<{ title: string; body: string; providerTemplateId: string | null } | null> {
  const t = pickTemplate(await loadTenantRows(db, tables, tenantId, event), channel, locale);
  if (!t || !t.body) return null;
  return {
    title: interpolate(t.subject, vars),
    body: interpolate(t.body, vars),
    providerTemplateId: t.providerTemplateId,
  };
}
