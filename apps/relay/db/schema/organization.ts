import { makePublicId } from "@foundry/database";
import { sql } from "drizzle-orm";
import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";

const nextIdText = sql`(next_id())::text`;

/**
 * Better Auth organization plugin tables. Ids are text (same as session/account)
 * so BA activeOrganizationId stays a string; userId stays bigint like session.
 * Limits are Relay platform fields (a6n Clients) — not Better Auth Infra.
 */
export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey().default(nextIdText),
    publicId: text("public_id").notNull().unique().$defaultFn(makePublicId("org")),
    appId: bigint("app_id", { mode: "bigint" }).notNull().default(sql`current_app_id()`),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    metadata: text("metadata"),
    /** Monthly sends across all apps in this workspace. 0 = unlimited. */
    monthlyMessageQuota: integer("monthly_message_quota").notNull().default(0),
    /** Max apps (tenants) this workspace may create. 0 = unlimited. */
    maxApps: integer("max_apps").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("organization_slug_unique").on(t.slug),
    index("organization_created_idx").on(t.createdAt),
  ],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey().default(nextIdText),
    publicId: text("public_id").notNull().unique().$defaultFn(makePublicId("mbr")),
    appId: bigint("app_id", { mode: "bigint" }).notNull().default(sql`current_app_id()`),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("member_organization_id_idx").on(t.organizationId),
    index("member_user_id_idx").on(t.userId),
    uniqueIndex("member_org_user_unique").on(t.organizationId, t.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey().default(nextIdText),
    publicId: text("public_id").notNull().unique().$defaultFn(makePublicId("inv")),
    appId: bigint("app_id", { mode: "bigint" }).notNull().default(sql`current_app_id()`),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    inviterId: bigint("inviter_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("invitation_organization_id_idx").on(t.organizationId),
    index("invitation_email_idx").on(t.email),
  ],
);
