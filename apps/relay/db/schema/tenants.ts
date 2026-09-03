import { updatableColumns } from "@foundry/database";
import { bigint, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

/** Channels a tenant API key may enqueue. Email is the only grantable channel in this slice. */
export const EMAIL_API_CHANNEL = "email" as const;

export const tenants = pgTable("tenants", {
  ...updatableColumns("tnt"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  /** ISO 3166-1 alpha-2 (or EU) for marketing compliance. */
  mailingCountry: text("mailing_country").notNull().default("CA"),
  /** CAN-SPAM / CASL postal address printed in marketing footers. */
  physicalAddress: text("physical_address"),
  /** Monthly outbox rows this app may enqueue. 0 = unlimited. */
  monthlyMessageQuota: integer("monthly_message_quota").notNull().default(10000),
  /** Max tenant_mailboxes rows. 0 = unlimited. */
  mailboxSeatQuota: integer("mailbox_seat_quota").notNull().default(5),
}, (t) => [
  uniqueIndex("tenants_slug_unique").on(t.slug),
]);

export const apiKeys = pgTable("api_keys", {
  ...updatableColumns("apk"),
  tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: text("scopes").notNull().default("messages:write"),
  channels: text("channels").array().notNull().default([EMAIL_API_CHANNEL]),
  revokedAt: bigint("revoked_at", { mode: "number" }),
}, (t) => [
  uniqueIndex("api_keys_hash_unique").on(t.keyHash),
  index("api_keys_prefix_idx").on(t.keyPrefix),
]);
