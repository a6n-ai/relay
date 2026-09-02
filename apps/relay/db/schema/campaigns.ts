import { updatableColumns } from "@foundry/database";
import { makeCampaignTables } from "@relay/engine/schema";
import { bigint, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/** Campaign copy locale. Transactional templates stay free-text; campaigns use a closed enum. */
export const campaignLocale = pgEnum("campaign_locale", ["en"]);

export const campaignTables = makeCampaignTables({ locale: campaignLocale });

export const {
  campaign,
  campaignContent,
  contactList,
  contactListMember,
  campaignStatus,
  consentSource,
} = campaignTables;

/**
 * Engine campaigns are app-global. Relay binds each campaign to one tenant
 * (SMTP, prefs, suppression, CAN-SPAM footer) as a Foundry updatable row.
 */
export const campaignTenant = pgTable("campaign_tenant", {
  ...updatableColumns("ctn"),
  campaignId: bigint("campaign_id", { mode: "bigint" })
    .notNull()
    .references(() => campaign.id),
  tenantId: bigint("tenant_id", { mode: "bigint" })
    .notNull()
    .references(() => tenants.id),
}, (t) => [
  uniqueIndex("campaign_tenant_campaign_id_unique").on(t.campaignId),
]);
