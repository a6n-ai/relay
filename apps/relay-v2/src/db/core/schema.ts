import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, flag, id, updatedAt } from "../columns";

// workspaceId and appId point at relay-security and are checked in code: D1 cannot foreign-key across databases.
export const workspaceProfile = sqliteTable("workspace_profile", {
  workspaceId: text("workspace_id").primaryKey(),
  mailingCountry: text("mailing_country").notNull().default("CA"),
  physicalAddress: text("physical_address"),
  monthlyMessageQuota: integer("monthly_message_quota").notNull().default(10000),
  defaultSesRegion: text("default_ses_region").notNull().default("ap-south-1"),
  doSchemaVersion: integer("do_schema_version").notNull().default(0),
  doMigrateError: text("do_migrate_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sendingDomain = sqliteTable("sending_domain", {
  id: id("dom"),
  workspaceId: text("workspace_id").notNull(),
  domain: text("domain").notNull().unique(),
  sesRegion: text("ses_region").notNull(),
  status: text("status", { enum: ["pending", "verified", "failed"] }).notNull().default("pending"),
  dkimStatus: text("dkim_status").notNull().default("pending"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const address = sqliteTable("address", {
  id: id("adr"),
  workspaceId: text("workspace_id").notNull(),
  appId: text("app_id").notNull(),
  email: text("email").notNull().unique(),
  kind: text("kind", { enum: ["inbox", "sender", "both"] }).notNull(),
  displayName: text("display_name"),
  canSend: flag("can_send").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [check("address_email_lower", sql`${t.email} = lower(trim(${t.email}))`)]);

export const usageDaily = sqliteTable(
  "usage_daily",
  {
    workspaceId: text("workspace_id").notNull(),
    day: text("day").notNull(),
    sent: integer("sent").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    bounced: integer("bounced").notNull().default(0),
    inbound: integer("inbound").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.day] })],
);
