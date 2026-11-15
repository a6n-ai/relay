import { baseColumns, updatableColumns } from "@foundry/database";
import { bigint, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./organization";
import { tenants } from "./tenants";

/** Catalog address: send-as, Relay inbox, or people inbox. Kind implies store. */
export const tenantMailboxes = pgTable("tenant_mailboxes", {
  ...updatableColumns("tmb"),
  tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(() => tenants.id),
  localPart: text("local_part").notNull(),
  domain: text("domain").notNull(),
  email: text("email").notNull(),
  kind: text("kind").notNull(),
}, (t) => [
  uniqueIndex("tenant_mailboxes_tenant_email_unique").on(t.tenantId, t.email),
]);

export const mailboxInboundFailure = pgTable("mailbox_inbound_failure", {
  ...baseColumns("mif"),
  rawKey: text("raw_key").notNull(),
  envelopeFrom: text("envelope_from").notNull(),
  envelopeTo: text("envelope_to").notNull(),
  authResults: text("auth_results"),
  receivedAt: bigint("received_at", { mode: "number" }).notNull(),
  error: text("error"),
  attempts: integer("attempts").notNull(),
  tenantId: bigint("tenant_id", { mode: "bigint" }).references(() => tenants.id),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  uniqueIndex("mailbox_inbound_failure_raw_key_uidx").on(t.rawKey),
  index("mailbox_inbound_failure_org_idx").on(t.organizationId),
]);
