import { updatableColumns } from "@foundry/database";
import { bigint, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
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
