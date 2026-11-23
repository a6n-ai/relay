import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { newId } from "../../lib/ids";

// better-auth writes Date values to *_at columns; timestamp_ms maps them to epoch-ms integers.
const id = (prefix: string) => text("id").primaryKey().$defaultFn(() => newId(prefix));
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const flag = (name: string) => integer(name, { mode: "boolean" });

export const user = sqliteTable("user", {
  id: id("usr"),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: flag("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  banned: flag("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable("session", {
  id: id("ses"),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
  activeTeamId: text("active_team_id"),
  impersonatedBy: text("impersonated_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = sqliteTable("account", {
  id: id("acc"),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = sqliteTable("verification", {
  id: id("vrf"),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspace = sqliteTable("workspace", {
  id: id("wsp"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  mailingCountry: text("mailing_country").notNull().default("CA"),
  physicalAddress: text("physical_address"),
  monthlyMessageQuota: integer("monthly_message_quota").notNull().default(10000),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  defaultSesRegion: text("default_ses_region").notNull().default("ap-south-1"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const member = sqliteTable("member", {
  id: id("mbr"),
  organizationId: text("organization_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const invitation = sqliteTable("invitation", {
  id: id("inv"),
  organizationId: text("organization_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  teamId: text("team_id"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const team = sqliteTable("team", {
  id: id("tea"),
  name: text("name").notNull(),
  organizationId: text("organization_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  memberCount: integer("member_count").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teamMember = sqliteTable("team_member", {
  id: id("tmm"),
  teamId: text("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  membershipKey: text("membership_key").unique(),
  createdAt: createdAt(),
});

export const app = sqliteTable(
  "app",
  {
    id: id("app"),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("app_workspace_slug").on(t.workspaceId, t.slug)],
);

export const apiKey = sqliteTable("api_key", {
  id: id("key"),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id),
  appId: text("app_id").notNull().references(() => app.id),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  hash: text("hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sendingDomain = sqliteTable("sending_domain", {
  id: id("dom"),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id),
  domain: text("domain").notNull().unique(),
  sesRegion: text("ses_region").notNull(),
  status: text("status", { enum: ["pending", "verified", "failed"] }).notNull().default("pending"),
  dkimStatus: text("dkim_status").notNull().default("pending"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const address = sqliteTable("address", {
  id: id("adr"),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id),
  appId: text("app_id").notNull().references(() => app.id),
  email: text("email").notNull().unique(),
  kind: text("kind", { enum: ["inbox", "sender", "both"] }).notNull(),
  displayName: text("display_name"),
  canSend: flag("can_send").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [check("address_email_lower", sql`${t.email} = lower(trim(${t.email}))`)]);

export const addressGrant = sqliteTable(
  "address_grant",
  {
    id: id("grt"),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id),
    addressId: text("address_id").notNull().references(() => address.id, { onDelete: "cascade" }),
    memberId: text("member_id").references(() => member.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [check("address_grant_one_target", sql`(${t.memberId} IS NULL) <> (${t.teamId} IS NULL)`)],
);

export const usageDaily = sqliteTable(
  "usage_daily",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspace.id),
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
