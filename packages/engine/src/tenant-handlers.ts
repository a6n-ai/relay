import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { CampaignTables } from "./campaign-schema";
import { appendUnsubscribeFooter, renderCampaignEmail, renderCampaignText } from "./template";
import { buildUnsubscribeUrl } from "./unsubscribe";
import { renderEmailForTenantEvent, renderTextForTenantEvent } from "./tenant-template";
import { archiveMailboxLetter, attachMailboxSendIds, generateRelayMessageId, mailboxOriginFromCampaignId } from "./mailbox";
import type { TenantNotificationTables } from "./tenant-schema";
import type { Channel, ChannelProvider } from "./types";
import type { ChannelHandler, OutboxRow } from "./handlers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

function payloadParts(row: OutboxRow) {
  const p = row.payload as { title?: string; body?: string; href?: string | null; vars?: Record<string, unknown> };
  return {
    title: typeof p.title === "string" ? p.title : "Notification",
    body: typeof p.body === "string" ? p.body : "",
    href: p.href ?? null,
    vars: p.vars ?? {},
  };
}

export interface TenantCampaignSendDeps {
  tables: CampaignTables;
  unsubscribe: { baseUrl: string; secret: string };
  loadSender: (tenantId: bigint) => Promise<{ name: string; postalAddress: string } | null>;
}

/**
 * Tenant drain handlers: recipients are literal addresses. In-app writes the
 * tenant feed keyed by externalUserId. Email uses campaign_content when
 * campaignId is set, else a per-tenant DB template when `event` is set, else
 * queued title/body.
 */
export function buildTenantHandlers(deps: {
  db: Db;
  tables: TenantNotificationTables;
  providers: Partial<Record<Channel, ChannelProvider>>;
  campaigns?: TenantCampaignSendDeps;
  loadFromAddress?: (tenantId: bigint) => Promise<{ email: string; name?: string } | null>;
}): Record<Channel, ChannelHandler | undefined> {
  const { db, tables, providers, campaigns, loadFromAddress } = deps;

  const inApp: ChannelHandler = async (row) => {
    const externalId = row.recipientExternalId as string | null;
    if (!externalId) return null;
    const { title, body, href, vars } = payloadParts(row);
    let rendered = { title, body };
    if (row.event) {
      const fromTpl = await renderTextForTenantEvent(
        db, tables, row.tenantId as bigint, row.event, "in_app", "en", vars,
      );
      if (fromTpl) rendered = { title: fromTpl.title, body: fromTpl.body };
    }
    const [n] = await db
      .insert(tables.notifications)
      .values({
        tenantId: row.tenantId,
        externalUserId: externalId,
        event: row.event,
        title: rendered.title,
        body: rendered.body,
        href,
      })
      .returning({ publicId: tables.notifications.publicId });
    return { providerMessageId: n.publicId as string };
  };

  const emailProvider = providers.email;
  const email: ChannelHandler | undefined = emailProvider
    ? async (row) => {
        const address = row.recipientEmail as string | null;
        if (!address) return null;
        const { title, body, vars } = payloadParts(row);
        let rendered: { subject: string; html: string; text: string } | null = null;

        if (row.campaignId) {
          if (!campaigns) return null;
          const base = await renderCampaignEmail(db, campaigns.tables, row.campaignId, "en", vars);
          if (!base) return null;
          const sender = await campaigns.loadSender(row.tenantId as bigint);
          if (!sender?.postalAddress) {
            throw new Error("Tenant needs a physical address before marketing email can send");
          }
          rendered = {
            subject: base.subject,
            ...appendUnsubscribeFooter(base, {
              url: buildUnsubscribeUrl(campaigns.unsubscribe.baseUrl, campaigns.unsubscribe.secret, address),
              sender: sender.name,
              address: sender.postalAddress,
            }),
          };
        } else if (row.event) {
          rendered = await renderEmailForTenantEvent(
            db, tables, row.tenantId as bigint, row.event, "en", vars,
          );
        }
        if (!rendered) {
          rendered = {
            subject: title,
            text: body,
            html: `<p>${body.replace(/</g, "&lt;")}</p>`,
          };
        }
        const from = (await loadFromAddress?.(row.tenantId as bigint)) ?? undefined;
        const rfcMessageId = generateRelayMessageId();
        await archiveMailboxLetter(db, tables, {
          outboxId: row.id as bigint,
          tenantId: (row.tenantId as bigint | null) ?? null,
          fromEmail: from?.email ?? "",
          fromName: from?.name ?? null,
          toEmail: address,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          direction: "out",
          origin: mailboxOriginFromCampaignId(row.campaignId as bigint | null | undefined),
        });
        const sent = await emailProvider.send({
          to: { email: address },
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          from,
          rfcMessageId,
        });
        await attachMailboxSendIds(db, tables, {
          outboxId: row.id as bigint,
          providerMessageId: sent.providerMessageId,
        });
        return sent;
      }
    : undefined;

  const phoneHandler = (channel: "sms" | "whatsapp"): ChannelHandler | undefined => {
    const provider = providers[channel];
    if (!provider) return undefined;
    return async (row) => {
      const phone = row.recipientPhone as string | null;
      if (!phone) return null;
      const { body, vars } = payloadParts(row);
      let text = body;
      let providerTemplateId: string | undefined;
      if (row.campaignId && campaigns) {
        const c = await renderCampaignText(db, campaigns.tables, row.campaignId, channel, "en", vars);
        if (!c) return null;
        text = c.body;
        providerTemplateId = c.providerTemplateId ?? undefined;
      } else if (row.event) {
        const c = await renderTextForTenantEvent(
          db, tables, row.tenantId as bigint, row.event, channel, "en", vars,
        );
        if (c) {
          text = c.body;
          providerTemplateId = c.providerTemplateId ?? undefined;
        }
      }
      if (!text && !providerTemplateId) return null;
      return provider.send({
        to: { phone },
        text,
        providerTemplateId,
        vars,
      });
    };
  };

  return {
    in_app: inApp,
    email,
    sms: phoneHandler("sms"),
    whatsapp: phoneHandler("whatsapp"),
  };
}
