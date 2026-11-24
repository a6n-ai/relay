import { env, runInDurableObject, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { requireActor, type ConsoleActor } from "../src/console/actor";
import { addApp } from "../src/console/apps";
import {
  createWebhookFor,
  deleteWebhookFor,
  listDeliveriesFor,
  listWebhooksFor,
  retryDeliveryFor,
  updateWebhookFor,
} from "../src/console/webhooks";
import { createAddress } from "../src/core/addresses";
import { createApp } from "../src/core/apps";
import { clientFor } from "../src/core/messages";
import { webhookInputSchema, webhookPatchSchema } from "../src/core/webhooks";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import type { InboundJob } from "../src/env";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

const HOOK_URL = "https://hooks.example/relay";
const stub = (workspaceId: string) => clientFor(env, workspaceId);

async function workspaceFor(email: string, name: string) {
  const cookie = await cookieFor(email, "user");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  const owner = await requireActor(env, headersFor(cookie), { permission: { webhook: ["write"] }, write: true });
  return { cookie, workspaceId, owner };
}

async function ingestLetter(workspaceId: string, appId: string, email: string): Promise<string> {
  const { id: addressId } = await createAddress(env, { workspaceId, appId, email, kind: "inbox" });
  const rawKey = `ws/${workspaceId}/raw/2026/11/${crypto.randomUUID()}.eml`;
  const letter = ["From: cust@example.com", `To: ${email}`, "Subject: Hi", "Message-ID: <hook@x>", "", "Hello"].join("\r\n");
  await env.MAIL.put(rawKey, new TextEncoder().encode(letter).buffer as ArrayBuffer);
  const job: InboundJob = {
    workspaceId,
    appId,
    addressId,
    rawKey,
    envelopeFrom: "bounce@example.com",
    envelopeTo: email,
    authResults: null,
    receivedAt: 1_700_000_000_000,
  };
  const { messageId } = (await stub(workspaceId).ingestInbound(workspaceId, job)) as { messageId: string };
  return messageId;
}

const rowsOf = (workspaceId: string, sql: string, ...args: (string | number)[]) =>
  runInDurableObject(stub(workspaceId), (_i, state) => state.storage.sql.exec(sql, ...args).toArray());

let sendSpy: MockInstance<typeof env.WEBHOOKS.send>;

beforeEach(() => {
  sendSpy = vi.spyOn(env.WEBHOOKS, "send").mockResolvedValue(undefined as never);
  vi.spyOn(env.WEBHOOKS, "sendBatch").mockResolvedValue(undefined as never);
});

describe("console webhooks: create, list, update, delete", { timeout: 60_000 }, () => {
  it("returns the secret once on create and never lists it", async () => {
    const { owner } = await workspaceFor("hook-owner@example.com", "Hook Owner Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const { webhook, secret } = await createWebhookFor(env, owner, appId, { url: HOOK_URL, events: ["mailbox.received"] });
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const [listed] = await listWebhooksFor(env, owner, appId);
    expect(listed).toEqual(webhook);
    expect(listed).not.toHaveProperty("secret");
    expect(listed).not.toHaveProperty("secretEnc");
  });

  it("refuses non-public, credentialed, non-https URLs and an empty event list", () => {
    const bad = [
      { url: "http://hooks.example", events: ["mailbox.received"] },
      { url: "https://localhost/x", events: ["mailbox.received"] },
      { url: "https://169.254.169.254/", events: ["mailbox.received"] },
      { url: "https://10.0.0.1/", events: ["mailbox.received"] },
      { url: "https://user:pw@hooks.example/", events: ["mailbox.received"] },
      { url: HOOK_URL, events: [] },
    ];
    for (const input of bad) {
      expect(webhookInputSchema.omit({ secret: true }).safeParse(input).success).toBe(false);
      expect(webhookPatchSchema.safeParse(input).success).toBe(false);
    }
  });

  it("drops a caller-supplied secret before the create", () => {
    const parsed = webhookInputSchema.omit({ secret: true }).parse({
      url: HOOK_URL,
      events: ["mailbox.received"],
      secret: "s".repeat(32),
    });
    expect(parsed).not.toHaveProperty("secret");
  });

  it("disables a webhook with PATCH enabled false", async () => {
    const { owner } = await workspaceFor("hook-patch@example.com", "Hook Patch Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const { webhook } = await createWebhookFor(env, owner, appId, { url: HOOK_URL, events: ["mailbox.received"] });
    const updated = await updateWebhookFor(env, owner, appId, webhook.id, { enabled: false });
    expect(updated).toMatchObject({ id: webhook.id, enabled: false });
  });

  it("answers 404 for another app's id, another workspace's app id, and deleted rows", async () => {
    const { owner } = await workspaceFor("hook-scope@example.com", "Hook Scope Co");
    const other = await workspaceFor("hook-scope-other@example.com", "Hook Scope Other Co");
    const { id: appA } = await addApp(env, owner, { name: "Web", slug: "web" });
    // Self-serve workspaces cap at one app through addApp, so the second app is created below that gate.
    const { id: appB } = await createApp(env, { workspaceId: owner.workspaceId, name: "Api", slug: "api" });
    const { id: foreignApp } = await addApp(env, other.owner, { name: "Foreign", slug: "foreign" });
    const { webhook } = await createWebhookFor(env, owner, appA, { url: HOOK_URL, events: ["mailbox.received"] });

    await expect(updateWebhookFor(env, owner, appB, webhook.id, { enabled: false })).rejects.toMatchObject({ status: 404 });
    await expect(deleteWebhookFor(env, owner, appB, webhook.id)).rejects.toMatchObject({ status: 404 });
    await expect(listDeliveriesFor(env, owner, appB, webhook.id)).rejects.toMatchObject({ status: 404 });
    await expect(listWebhooksFor(env, other.owner, appA)).rejects.toMatchObject({ status: 404 });
    await expect(createWebhookFor(env, other.owner, foreignApp, { url: HOOK_URL, events: ["mailbox.received"] })).resolves.toMatchObject({
      webhook: { appId: foreignApp },
    });
    await expect(createWebhookFor(env, other.owner, appA, { url: HOOK_URL, events: ["mailbox.received"] })).rejects.toMatchObject({
      status: 404,
    });
    expect(await updateWebhookFor(env, owner, appA, webhook.id, { enabled: false })).toMatchObject({ enabled: false });
  });

  it("refuses a member's write and a suspended workspace's write, but lets a member read", async () => {
    const { cookie: ownerCookie, workspaceId, owner } = await workspaceFor("hook-role@example.com", "Hook Role Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    await createWebhookFor(env, owner, appId, { url: HOOK_URL, events: ["mailbox.received"] });
    const memberCookie = await addMember(workspaceId, "hook-role-member@example.com", "member");
    const member: ConsoleActor = await requireActor(env, headersFor(memberCookie), { permission: { webhook: ["read"] } });
    expect(await listWebhooksFor(env, member, appId)).toHaveLength(1);
    await expect(requireActor(env, headersFor(memberCookie), { permission: { webhook: ["write"] }, write: true })).rejects.toMatchObject({
      status: 403,
    });
    await securityDb(env).update(workspace).set({ status: "suspended" }).where(eq(workspace.id, workspaceId));
    await expect(requireActor(env, headersFor(ownerCookie), { permission: { webhook: ["write"] }, write: true })).rejects.toMatchObject({
      status: 403,
      message: "workspace suspended",
    });
  });
});

describe("console webhooks: delivery log and retry", { timeout: 60_000 }, () => {
  it("lists a pending delivery without its payload key", async () => {
    const { owner, workspaceId } = await workspaceFor("hook-log@example.com", "Hook Log Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const { webhook } = await createWebhookFor(env, owner, appId, { url: HOOK_URL, events: ["mailbox.received"] });
    const messageId = await ingestLetter(workspaceId, appId, "in@hook-log.test");
    const { rows, webhook: listed, nextCursor } = await listDeliveriesFor(env, owner, appId, webhook.id);
    expect(listed.id).toBe(webhook.id);
    expect(nextCursor).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ messageId, status: "pending", attempts: 0 });
    expect(rows[0]).not.toHaveProperty("payloadKey");
  });

  it("refuses a retry of a pending delivery with 409 delivery not failed", async () => {
    const { owner, workspaceId } = await workspaceFor("hook-pending@example.com", "Hook Pending Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const { webhook } = await createWebhookFor(env, owner, appId, { url: HOOK_URL, events: ["mailbox.received"] });
    await ingestLetter(workspaceId, appId, "in@hook-pending.test");
    const { rows } = await listDeliveriesFor(env, owner, appId, webhook.id);
    await expect(retryDeliveryFor(env, owner, appId, rows[0].id)).rejects.toMatchObject({
      status: 409,
      message: "delivery not failed",
    });
  });

  it("re-queues a failed delivery in place and sends the same job", async () => {
    const { owner, workspaceId } = await workspaceFor("hook-retry@example.com", "Hook Retry Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const { webhook } = await createWebhookFor(env, owner, appId, { url: HOOK_URL, events: ["mailbox.received"] });
    await ingestLetter(workspaceId, appId, "in@hook-retry.test");
    const { rows } = await listDeliveriesFor(env, owner, appId, webhook.id);
    const deliveryId = rows[0].id;
    await runInDurableObject(stub(workspaceId), (_i, state) => {
      state.storage.sql.exec("UPDATE webhook_delivery SET status = 'failed', attempts = 6, last_error = 'HTTP 500' WHERE id = ?", deliveryId);
    });

    await expect(retryDeliveryFor(env, owner, appId, deliveryId)).resolves.toBeUndefined();
    const [row] = await rowsOf(workspaceId, "SELECT status, attempts, claimed_until FROM webhook_delivery WHERE id = ?", deliveryId);
    expect(row).toMatchObject({ status: "pending", attempts: 0, claimed_until: null });
    expect(sendSpy).toHaveBeenCalledWith({ workspaceId, deliveryId });
    const all = await rowsOf(workspaceId, "SELECT id FROM webhook_delivery WHERE webhook_id = ?", webhook.id);
    expect(all).toHaveLength(1);
  });

  it("refuses a retry while the webhook is disabled with 409 webhook disabled", async () => {
    const { owner, workspaceId } = await workspaceFor("hook-disabled@example.com", "Hook Disabled Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const { webhook } = await createWebhookFor(env, owner, appId, { url: HOOK_URL, events: ["mailbox.received"] });
    await ingestLetter(workspaceId, appId, "in@hook-disabled.test");
    const { rows } = await listDeliveriesFor(env, owner, appId, webhook.id);
    await runInDurableObject(stub(workspaceId), (_i, state) => {
      state.storage.sql.exec("UPDATE webhook_delivery SET status = 'failed', attempts = 6 WHERE id = ?", rows[0].id);
    });
    await updateWebhookFor(env, owner, appId, webhook.id, { enabled: false });
    await expect(retryDeliveryFor(env, owner, appId, rows[0].id)).rejects.toMatchObject({
      status: 409,
      message: "webhook disabled",
    });
  });

  it("marks a delivery failed with the fixed reason when its webhook was deleted while pending", async () => {
    const { owner, workspaceId } = await workspaceFor("hook-deleted@example.com", "Hook Deleted Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const { webhook } = await createWebhookFor(env, owner, appId, { url: HOOK_URL, events: ["mailbox.received"] });
    await ingestLetter(workspaceId, appId, "in@hook-deleted.test");
    const { rows } = await listDeliveriesFor(env, owner, appId, webhook.id);
    await deleteWebhookFor(env, owner, appId, webhook.id);

    expect(await stub(workspaceId).claimWebhookDelivery(workspaceId, rows[0].id)).toEqual({ kind: "skip" });
    const [row] = await rowsOf(workspaceId, "SELECT status, last_error FROM webhook_delivery WHERE id = ?", rows[0].id);
    expect(row).toEqual({ status: "failed", last_error: "Webhook missing or disabled" });
  });

  it("renders the webhook list and delivery log for an owner, and hides write controls from a member", async () => {
    const { cookie, workspaceId, owner } = await workspaceFor("hook-ssr@example.com", "Hook Ssr Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const { webhook } = await createWebhookFor(env, owner, appId, { url: HOOK_URL, events: ["mailbox.received"] });
    const messageId = await ingestLetter(workspaceId, appId, "in@hook-ssr.test");
    const memberCookie = await addMember(workspaceId, "hook-ssr-member@example.com", "member");

    const list = await SELF.fetch(`${ORIGIN}/apps/${appId}/webhooks`, { redirect: "manual", headers: { cookie } });
    expect(list.status).toBe(200);
    expect(await list.text()).toContain(HOOK_URL);

    await rowsOf(workspaceId, "UPDATE webhook_delivery SET status = 'failed', attempts = 6 WHERE message_id = ?", messageId);

    const detail = await SELF.fetch(`${ORIGIN}/apps/${appId}/webhooks/${webhook.id}`, { redirect: "manual", headers: { cookie } });
    expect(detail.status).toBe(200);
    const detailHtml = await detail.text();
    expect(detailHtml).toContain(messageId);
    expect(detailHtml).toContain("Retry");

    const memberList = await SELF.fetch(`${ORIGIN}/apps/${appId}/webhooks`, { redirect: "manual", headers: { cookie: memberCookie } });
    expect(memberList.status).toBe(200);
    expect(await memberList.text()).not.toContain("New webhook");

    const memberDetail = await SELF.fetch(`${ORIGIN}/apps/${appId}/webhooks/${webhook.id}`, {
      redirect: "manual",
      headers: { cookie: memberCookie },
    });
    expect(memberDetail.status).toBe(200);
    const memberHtml = await memberDetail.text();
    expect(memberHtml).toContain(messageId);
    expect(memberHtml).not.toContain("Retry");
  });
});
