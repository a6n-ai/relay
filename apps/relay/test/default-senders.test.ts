import { createExecutionContext, env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp, getDefaultSenders, setDefaultSendersFor } from "../src/services/apps";
import { removeAddress, updateAddress } from "../src/services/domains";
import { createApiKey } from "../src/services/api-keys";
import { createAddress } from "../src/core/addresses";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { app, securityAudit } from "../src/db/security/schema";
import { RelayRpc } from "../src/rpc/relay-rpc";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

beforeEach(() => {
  vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const body = { to: "guest@x.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };
const unsub = { html: "<a href='{{unsubscribe_url}}'>u</a>", text: "{{unsubscribe_url}}" };

async function setup(slug: string) {
  const cookie = await cookieFor(`${slug}@example.com`, "admin");
  const workspaceId = await createWorkspace(cookie, `${slug} Co`);
  await setActive(cookie, workspaceId);
  const actor = await requireActor(env, headersFor(cookie));
  const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
  const domain = `${slug}.test`;
  await coreDb(env).insert(sendingDomain).values({ workspaceId, domain, sesRegion: "us-east-1", status: "verified" });
  const sender = (local: string, extra: { displayName?: string; replyTo?: string; canSend?: boolean } = {}) =>
    createAddress(env, { workspaceId, appId, email: `${local}@${domain}`, kind: "sender", canSend: true, ...extra });
  const key = (await createApiKey(env, { workspaceId, appId, name: "k" })).secret;
  const rpc = new RelayRpc(createExecutionContext(), env);
  const stub = env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
  const call = (path: string, payload: unknown) =>
    SELF.fetch(`https://relay.test/api/v1${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  const defaults = (transactionalId: string | null, marketingId: string | null) =>
    setDefaultSendersFor(env, actor, appId, { transactionalId, marketingId });
  return { cookie, workspaceId, actor, appId, domain, sender, key, rpc, stub, call, defaults };
}

describe("send without from", () => {
  it("uses each stream's default with its name and reply-to, over HTTP and RPC", async () => {
    const t = await setup("ds-send");
    const tx = await t.sender("orders", { displayName: "Orders", replyTo: "help@ds-send.test" });
    const mk = await t.sender("news", { displayName: "News" });
    await t.defaults(tx.id, mk.id);

    const http = await t.call("/messages", { ...body, stream: "transactional" });
    expect(http.status).toBe(202);
    const { messageId } = (await http.json()) as { messageId: string };
    expect(await t.stub.getMessage(t.workspaceId, messageId)).toMatchObject({
      fromEmail: "orders@ds-send.test",
      fromName: "Orders",
      replyTo: "help@ds-send.test",
    });

    const tracked = await t.rpc.send(t.key, { ...body, stream: "tracked" });
    expect(await t.stub.getMessage(t.workspaceId, tracked.messageId)).toMatchObject({ fromEmail: "orders@ds-send.test" });

    const marketing = await t.rpc.send(t.key, { ...body, ...unsub, stream: "marketing" });
    expect(await t.stub.getMessage(t.workspaceId, marketing.messageId)).toMatchObject({
      fromEmail: "news@ds-send.test",
      fromName: "News",
      replyTo: null,
    });
  });

  it("lets the request override the name and reply-to", async () => {
    const t = await setup("ds-override");
    const tx = await t.sender("orders", { displayName: "Orders", replyTo: "help@ds-override.test" });
    await t.defaults(tx.id, null);
    const sent = await t.rpc.send(t.key, { ...body, stream: "transactional", fromName: "Custom", replyTo: "Me@x.com" });
    expect(await t.stub.getMessage(t.workspaceId, sent.messageId)).toMatchObject({ fromName: "Custom", replyTo: "me@x.com" });
  });

  it("is refused with 422 no_default_sender when the stream has no default, over HTTP and RPC", async () => {
    const t = await setup("ds-none");
    const tx = await t.sender("orders");
    await t.defaults(tx.id, null);

    const http = await t.call("/messages", { ...body, ...unsub, stream: "marketing" });
    expect(http.status).toBe(422);
    expect(await http.json()).toEqual({ error: "no_default_sender" });
    await expect(t.rpc.send(t.key, { ...body, ...unsub, stream: "marketing" })).rejects.toThrow("no_default_sender");
    const tpl = await t.call("/templates/send", { stream: "marketing", to: "a@x.com", templateId: "tpl_missing" });
    expect(tpl.status).toBe(404);
  });

  it("is refused as sender_not_verified when the default can no longer send", async () => {
    const t = await setup("ds-off");
    const tx = await t.sender("orders");
    await t.defaults(tx.id, null);
    await coreDb(env).update(address).set({ canSend: false }).where(eq(address.id, tx.id));
    await t.stub.refreshLimits(t.workspaceId);

    const http = await t.call("/messages", { ...body, stream: "transactional" });
    expect(http.status).toBe(422);
    expect(await http.json()).toEqual({ error: "sender_not_verified" });
  });
});

describe("send with from", () => {
  it("keeps working and picks up the address's name and reply-to", async () => {
    const t = await setup("ds-explicit");
    await t.sender("orders", { displayName: "Orders", replyTo: "help@ds-explicit.test" });
    const sent = await t.rpc.send(t.key, { ...body, stream: "transactional", from: "Orders@ds-explicit.test" });
    expect(await t.stub.getMessage(t.workspaceId, sent.messageId)).toMatchObject({ fromName: "Orders", replyTo: "help@ds-explicit.test" });

    const bad = await t.call("/messages", { ...body, stream: "transactional", from: "nobody@ds-explicit.test" });
    expect(bad.status).toBe(422);
  });
});

describe("console default senders", () => {
  it("saves, audits ids only, and refuses an address that cannot send or is not this app's", async () => {
    const t = await setup("ds-console");
    const tx = await t.sender("orders");
    const off = await t.sender("off", { canSend: false });
    await coreDb(env).update(address).set({ canSend: false }).where(eq(address.id, off.id));

    await t.defaults(tx.id, null);
    expect(await getDefaultSenders(env, t.actor, t.appId)).toMatchObject({
      transactionalId: tx.id,
      marketingId: null,
      options: [{ id: tx.id, email: "orders@ds-console.test" }],
    });
    await expect(t.defaults(off.id, null)).rejects.toMatchObject({ status: 400 });
    await expect(t.defaults("adr_missing", null)).rejects.toMatchObject({ status: 400 });

    const [audit] = await securityDb(env).select().from(securityAudit).where(and(eq(securityAudit.action, "app.default_senders"), eq(securityAudit.target, t.appId)));
    expect(JSON.parse(audit.data ?? "{}")).toEqual({ appId: t.appId, transactionalId: tx.id, marketingId: null });
    expect(audit.target).toBe(t.appId);
  });

  it("refuses a member and clears a default when its address is removed", async () => {
    const t = await setup("ds-clear");
    const tx = await t.sender("orders");
    const mk = await t.sender("news");
    await t.defaults(tx.id, mk.id);

    const memberCookie = await addMember(t.workspaceId, "ds-clear-m@example.com", "member");
    await expect(requireActor(env, headersFor(memberCookie), { permission: { tenant: ["write"] }, write: true })).rejects.toMatchObject({ status: 403 });

    await removeAddress(env, t.actor, tx.id);
    const [row] = await securityDb(env).select().from(app).where(eq(app.id, t.appId));
    expect(row).toMatchObject({ defaultTransactionalAddressId: null, defaultMarketingAddressId: mk.id });
  });

  it("stores a reply-to edit and lets it through to the next send", async () => {
    const t = await setup("ds-edit");
    const tx = await t.sender("orders", { displayName: "Orders" });
    await updateAddress(env, t.actor, tx.id, { replyTo: "help@ds-edit.test", displayName: "Shop" });
    const [row] = await coreDb(env).select().from(address).where(eq(address.id, tx.id));
    expect(row).toMatchObject({ replyTo: "help@ds-edit.test", displayName: "Shop" });

    const sent = await t.rpc.send(t.key, { ...body, stream: "transactional", from: "orders@ds-edit.test" });
    expect(await t.stub.getMessage(t.workspaceId, sent.messageId)).toMatchObject({ fromName: "Shop", replyTo: "help@ds-edit.test" });
  });
});
