import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, flag, id, timestamp, updatedAt } from "../columns";

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

export const rateLimit = sqliteTable("rate_limit", {
  id: id("rtl"),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

export const workspace = sqliteTable("workspace", {
  id: id("wsp"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  suspendedAt: timestamp("suspended_at"),
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
    // Ids of relay-core address rows: no cross-database FK, so addresses.ts clears them on delete.
    defaultTransactionalAddressId: text("default_transactional_address_id"),
    defaultMarketingAddressId: text("default_marketing_address_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("app_workspace_slug").on(t.workspaceId, t.slug)],
);

// Columns are the @better-auth/api-key 1.7.18 model "apikey". referenceId is the owning workspace; metadata holds { appId }.
export const apiKey = sqliteTable(
  "apikey",
  {
    id: id("key"),
    configId: text("config_id").notNull().default("default"),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull(),
    referenceId: text("reference_id").notNull().references(() => workspace.id),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at"),
    enabled: flag("enabled").notNull().default(true),
    rateLimitEnabled: flag("rate_limit_enabled").notNull().default(false),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").notNull().default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request"),
    expiresAt: timestamp("expires_at"),
    permissions: text("permissions"),
    metadata: text("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("apikey_key").on(t.key), index("apikey_reference").on(t.referenceId)],
);

// addressId is checked in code against relay-core: D1 cannot foreign-key across databases.
export const addressGrant = sqliteTable(
  "address_grant",
  {
    id: id("grt"),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id),
    addressId: text("address_id").notNull(),
    memberId: text("member_id").references(() => member.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("address_grant_one_target", sql`(${t.memberId} IS NULL) <> (${t.teamId} IS NULL)`),
    uniqueIndex("address_grant_member_unique").on(t.addressId, t.memberId).where(sql`${t.memberId} IS NOT NULL`),
    uniqueIndex("address_grant_team_unique").on(t.addressId, t.teamId).where(sql`${t.teamId} IS NOT NULL`),
  ],
);

// Never store OTPs, tokens or key secrets in data.
export const securityAudit = sqliteTable("security_audit", {
  id: id("sau"),
  actorUserId: text("actor_user_id"),
  workspaceId: text("workspace_id"),
  action: text("action").notNull(),
  target: text("target"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  data: text("data"),
  createdAt: createdAt(),
});
