import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { interpolate } from "./interpolate";
import type { CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface TemplateRow {
  channel: string;
  locale: string;
  subject: string;
  body: string | null;
  html: string | null;
  text: string | null;
  providerTemplateId: string | null;
  enabled: boolean;
  /** Campaign content only — event templates never carry attachments. */
  attachments?: { filename: string; url: string; contentType: string }[];
}

/** Pure: pick the enabled row for `channel`, preferring `locale`, else `en`. */
export function pickTemplate(rows: TemplateRow[], channel: string, locale: string): TemplateRow | null {
  const enabled = rows.filter((r) => r.channel === channel && r.enabled);
  return enabled.find((r) => r.locale === locale) ?? enabled.find((r) => r.locale === "en") ?? null;
}

async function loadRows(db: Db, tables: NotificationTables, event: string): Promise<TemplateRow[]> {
  const t = tables.notificationTemplate;
  return db.select({
    channel: t.channel, locale: t.locale, subject: t.subject, body: t.body,
    html: t.html, text: t.text, providerTemplateId: t.providerTemplateId, enabled: t.enabled,
  }).from(t).where(eq(t.event, event as never)) as unknown as Promise<TemplateRow[]>;
}

/** Resolve + render the email body for an event/locale, or null if no template. */
export async function renderEmailForEvent(
  db: Db, tables: NotificationTables, event: string, locale: string, vars: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string } | null> {
  const t = pickTemplate(await loadRows(db, tables, event), "email", locale);
  if (!t || !t.html || !t.text) return null;
  return {
    subject: interpolate(t.subject, vars),
    html: interpolate(t.html, vars),
    text: interpolate(t.text, vars),
  };
}

/** Resolve + render the in-app title/body for an event/locale, or null. */
export async function renderInAppForEvent(
  db: Db, tables: NotificationTables, event: string, locale: string, vars: Record<string, unknown>,
): Promise<{ title: string; body: string } | null> {
  const t = pickTemplate(await loadRows(db, tables, event), "in_app", locale);
  if (!t || !t.body) return null;
  return { title: interpolate(t.subject, vars), body: interpolate(t.body, vars) };
}

const FOOTER_MARKER = "data-realm-unsub";

export interface FooterInfo {
  url: string;
  /** Sender identification — required on every commercial message. */
  sender: string;
  /** Physical mailing address — also required. */
  address: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * CASL requires sender identification, a physical mailing address and a working
 * unsubscribe on every commercial message. Appending it here rather than
 * leaving it to whoever writes the copy means it cannot be forgotten — and the
 * marker makes a second pass idempotent.
 */
export function appendUnsubscribeFooter(
  parts: { html: string; text: string },
  footer: FooterInfo,
  opts: { preview?: boolean } = {},
): { html: string; text: string } {
  if (parts.html.includes(FOOTER_MARKER)) return parts;
  const sender = escapeHtml(footer.sender);
  const address = escapeHtml(footer.address);
  const url = escapeHtml(footer.url);
  // A centered, divider-topped signature block — reads as part of the
  // template's own layout rather than a disclaimer bolted underneath it.
  // Inherits font-family from whatever the admin designed above; only size
  // and color are set, both muted so it recedes under the actual content.
  // Table-based (not div/p) for email-client-safe centering.
  //
  // In an admin preview only, tint the block and add a caption — otherwise
  // it's easy to miss entirely (muted-by-design against a long email) and an
  // admin can end up unsure whether it's there at all. Never shown to a
  // recipient: `opts.preview` only affects previewHtml/the editor's live
  // preview, never the html actually sent.
  const bg = opts.preview ? "background:#fffbeb;border:1px dashed #d4a72c;border-radius:8px;padding:12px 16px" : "";
  const caption = opts.preview
    ? `<div style="font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:#b45309;margin-bottom:6px">Added automatically at send</div>`
    : "";
  const html =
    `${parts.html}\n<table ${FOOTER_MARKER} role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="margin-top:32px;${opts.preview ? "" : "border-top:1px solid #e5e5e5;"}${bg}"><tr><td align="center" ` +
    `style="${opts.preview ? "" : "padding-top:16px;"}font-size:12px;line-height:1.6;color:#8a8a8a">` +
    `${caption}` +
    `${sender} · ${address}<br/>` +
    `<a href="${url}" style="color:#8a8a8a;text-decoration:underline">Unsubscribe</a>` +
    `</td></tr></table>`;
  const text = `${parts.text}\n\n--\n${footer.sender} · ${footer.address}\nUnsubscribe: ${footer.url}\n`;
  return { html, text };
}

/**
 * Stamp the same CASL footer onto content for admin preview, returned as
 * separate `previewHtml`/`previewText` fields rather than overwriting `html`/
 * `text` — those stay the raw stored source so an editable row still edits
 * (and saves) the real content, not a copy with a placeholder unsubscribe
 * link baked in.
 */
export function withPreviewFooter<T extends { channel: string; html: string | null; text: string | null }>(
  rows: T[],
  footer: FooterInfo,
): (T & { previewHtml: string | null; previewText: string | null })[] {
  return rows.map((r) => {
    if (r.channel !== "email" || !r.html || !r.text) return { ...r, previewHtml: r.html, previewText: r.text };
    const stamped = appendUnsubscribeFooter({ html: r.html, text: r.text }, footer, { preview: true });
    return { ...r, previewHtml: stamped.html, previewText: stamped.text };
  });
}

async function loadCampaignContent(db: Db, tables: CampaignTables, campaignId: bigint) {
  const c = tables.campaignContent;
  return db
    .select({
      channel: c.channel,
      locale: c.locale,
      subject: c.subject,
      body: c.body,
      html: c.html,
      text: c.text,
      providerTemplateId: c.providerTemplateId,
      attachments: c.attachments,
    })
    .from(c)
    .where(eq(c.campaignId, campaignId)) as unknown as Promise<Omit<TemplateRow, "enabled">[]>;
}

/** Campaign email content for a locale, or null when the channel has none. */
export async function renderCampaignEmail(
  db: Db,
  tables: CampaignTables,
  campaignId: bigint,
  locale: string,
  vars: Record<string, unknown>,
): Promise<{
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; url: string; contentType: string }[];
} | null> {
  const rows = (await loadCampaignContent(db, tables, campaignId)).map((r) => ({ ...r, enabled: true }));
  const t = pickTemplate(rows, "email", locale);
  if (!t || !t.html || !t.text) return null;
  return {
    subject: interpolate(t.subject, vars),
    html: interpolate(t.html, vars),
    text: interpolate(t.text, vars),
    attachments: t.attachments ?? [],
  };
}

/** Campaign text content (sms/whatsapp/in_app) for a locale, or null. */
export async function renderCampaignText(
  db: Db,
  tables: CampaignTables,
  campaignId: bigint,
  channel: string,
  locale: string,
  vars: Record<string, unknown>,
): Promise<{ title: string; body: string; providerTemplateId: string | null } | null> {
  const rows = (await loadCampaignContent(db, tables, campaignId)).map((r) => ({ ...r, enabled: true }));
  const t = pickTemplate(rows, channel, locale);
  if (!t || !t.body) return null;
  return {
    title: interpolate(t.subject, vars),
    body: interpolate(t.body, vars),
    providerTemplateId: t.providerTemplateId,
  };
}
