import { updatableColumns } from "@foundry/database";
import { bigint, boolean, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const sendingDomains = pgTable("sending_domains", {
  ...updatableColumns("sdm"),
  tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(() => tenants.id),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("pending"),
  verifyToken: text("verify_token").notNull(),
  dkimSelector: text("dkim_selector").notNull().default("relay"),
  dkimPublic: text("dkim_public"),
  dkimPrivate: text("dkim_private"),
  spfInclude: text("spf_include"),
  verifiedAt: bigint("verified_at", { mode: "number" }),
  lastCheckedAt: bigint("last_checked_at", { mode: "number" }),
  lastError: text("last_error"),
}, (t) => [
  uniqueIndex("sending_domains_tenant_domain_unique").on(t.tenantId, t.domain),
]);

/** Operator SMTP (one row). Env SMTP_* still wins when EMAIL_TRANSPORT=smtp and SMTP_HOST is set. */
export const emailSmtpSettings = pgTable("email_smtp_settings", {
  ...updatableColumns("ess"),
  host: text("host").notNull(),
  port: integer("port").notNull().default(587),
  secure: boolean("secure").notNull().default(false),
  username: text("username"),
  password: text("password"),
  spfInclude: text("spf_include"),
});
