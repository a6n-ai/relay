import { updatableColumns } from "@foundry/database";
import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { outboxStatus } from "@relay/engine/schema";
import { contactList } from "./campaigns";
import { tenants } from "./tenants";

export const WEBHOOK_EVENTS = [
  "message.queued",
  "message.sent",
  "message.failed",
  "message.bounced",
  "message.complained",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const tenantWebhook = pgTable("tenant_webhook", {
  ...updatableColumns("twh"),
  tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(() => tenants.id),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull(),
  enabled: boolean("enabled").notNull().default(true),
}, (t) => [
  index("tenant_webhook_tenant_idx").on(t.tenantId),
]);

export const tenantWebhookDelivery = pgTable("tenant_webhook_delivery", {
  ...updatableColumns("twd"),
  webhookId: bigint("webhook_id", { mode: "bigint" }).notNull().references(() => tenantWebhook.id),
  tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(() => tenants.id),
  event: text("event").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  lastError: text("last_error"),
  responseStatus: integer("response_status"),
}, (t) => [
  index("tenant_webhook_delivery_due_idx").on(t.status, t.nextAttemptAt),
]);

export const listAutomation = pgTable("list_automation", {
  ...updatableColumns("lau"),
  tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  triggerEvent: text("trigger_event").notNull(),
  listId: bigint("list_id", { mode: "bigint" }).notNull().references(() => contactList.id),
  enabled: boolean("enabled").notNull().default(true),
}, (t) => [
  uniqueIndex("list_automation_tenant_event_list_idx").on(t.tenantId, t.triggerEvent, t.listId),
]);
