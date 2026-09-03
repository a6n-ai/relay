import { updatableColumns } from "@foundry/database";
import { bigint, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/** Operator tags on an app. Every message for that app (mail, later WhatsApp) inherits them. */
export const appMessageTags = pgTable("app_message_tags", {
  ...updatableColumns("amt"),
  tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(() => tenants.id),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
}, (t) => [
  uniqueIndex("app_message_tags_tenant_slug_unique").on(t.tenantId, t.slug),
  index("app_message_tags_tenant_idx").on(t.tenantId),
]);
