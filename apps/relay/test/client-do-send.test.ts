import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { sendTemplateMessage } from "../src/services/messages";
import { coreDb } from "../src/db/core/client";
import { address } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import { applyMigrations, seedVerifiedSender } from "./migrate";

const base = {
  appId: "app_1",
  stream: "transactional" as const,
  from: "Relay@A6n.ai",
  to: "a@x.com",
  subject: "Order 1",
  html: "<p>Thanks</p>",
  text: "Thanks",
};


async function seedOwnSender(workspaceId: string, appId: string, email: string) {
  await coreDb(env).insert(address).values({ workspaceId, appId, email, kind: "sender", canSend: true });
}

const stubFor = (workspaceId: string) => env.CLIENT.get(env.CLIENT.idFromName(workspaceId));

async function seededStub(workspaceId: string) {
  await securityDb(env).insert(workspace).values({ id: workspaceId, name: workspaceId, slug: workspaceId });
  await seedVerifiedSender(workspaceId);
  return stubFor(workspaceId);
}

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const messageCount = async (stub: ReturnType<typeof stubFor>, ws: string) =>
  (await stub.listMessages(ws, { direction: "out" }, { out: true, inbound: "all" })).rows.length;

const settle = <T>(p: Promise<T>) => p.then((value) => ({ value }), (e: Error) => ({ error: e.message }));
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

let enqueue: MockInstance<typeof env.SEND.send>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  enqueue = vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const refused = (call: Promise<unknown>) => call.then(() => "resolved", (e: Error) => e.message);

describe("ClientDO send", () => {
  it("answers limits unavailable, not sender_not_verified, when a fresh DO cannot reach D1", async () => {
    const ws = "wsp_fresh_d1_down";
    const stub = await seededStub(ws);
    vi.spyOn(env.CORE_DB, "prepare").mockImplementation(() => {
      throw new Error("D1 down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await refused(stub.send(ws, base))).toBe("limits unavailable");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("answers limits unavailable, not sender_not_verified, for an unknown sender while D1 is down and the snapshot is stale", async () => {
    const ws = "wsp_stale_d1_down";
    const stub = await seededStub(ws);
    await stub.send(ws, base);
    await runInDurableObject(stub, (_i, state) => {
      const snapshot = state.storage.kv.get<{ fetchedAt: number }>("limits:v2")!;
      state.storage.kv.put("limits:v2", { ...snapshot, fetchedAt: Date.now() - 120_000 });
    });
    vi.spyOn(env.CORE_DB, "prepare").mockImplementation(() => {
      throw new Error("D1 down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await refused(stub.send(ws, { ...base, from: "new@a6n.ai" }))).toBe("limits unavailable");
    expect(await refused(stub.send(ws, { ...base, subject: "Order 2" }))).toBe("resolved");
  });

  it("queues a message, stores html in R2 and enqueues one send job", async () => {
    const ws = "wsp_test";
    const stub = await seededStub(ws);
    const sent = await stub.send(ws, base);

    expect(sent).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "queued", duplicate: false });
    const obj = await env.MAIL.get(`ws/${ws}/msg/${sent.messageId}.html`);
    expect(await obj?.text()).toBe(base.html);

    const view = await stub.getMessage(ws, sent.messageId);
    expect(view).toMatchObject({ id: sent.messageId, subject: base.subject, status: "queued" });
    expect(view?.html).toBe(base.html);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({ workspaceId: ws, messageId: sent.messageId });
  });

  it("returns the original message for a repeated idempotency key and changes nothing", async () => {
    const ws = "wsp_idem";
    const stub = await seededStub(ws);
    const first = await stub.send(ws, { ...base, idempotencyKey: "order:1:confirmation" });
    const second = await stub.send(ws, {
      ...base,
      subject: "Changed",
      idempotencyKey: "order:1:confirmation",
    });

    expect(second).toEqual({ messageId: first.messageId, status: "queued", duplicate: true });
    expect((await stub.getMessage(ws, first.messageId))?.subject).toBe(base.subject);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("treats a suppressed recipient as suppressed when case and spaces differ", async () => {
    const ws = "wsp_sup";
    const stub = await seededStub(ws);
    await stub.addSuppression(ws, "a@x.com", "unsubscribe");
    const sent = await stub.send(ws, { ...base, to: " A@X.com " });

    expect(sent).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "suppressed", duplicate: false });
    expect(await env.MAIL.get(`ws/${ws}/msg/${sent.messageId}.html`)).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("blocks only the suppressed stream", async () => {
    const ws = "wsp_stream";
    const stub = await seededStub(ws);
    await stub.addSuppression(ws, "m@x.com", "manual", "marketing");

    const marketing = await stub.send(ws, { ...base, stream: "marketing", to: "m@x.com" });
    const transactional = await stub.send(ws, { ...base, stream: "transactional", to: "m@x.com" });

    expect(marketing.status).toBe("suppressed");
    expect(transactional.status).toBe("queued");
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input and writes nothing", async () => {
    const ws = "wsp_invalid";
    const stub = await seededStub(ws);
    // Rejections from RPC calls surface as unhandled in this plugin, so the calls run inside the DO.
    const failures = await runInDurableObject(stub, (instance) =>
      Promise.all([
        instance.send(ws, { ...base, subject: "" }).then(() => "resolved", (e: Error) => `${e.name}: ${e.message}`),
        instance.send(ws, { ...base, to: "not-an-email" }).then(() => "resolved", (e: Error) => `${e.name}: ${e.message}`),
      ]),
    );
    expect(failures[0]).toMatch(/^ZodError: .*"subject"/s);
    expect(failures[1]).toMatch(/^ZodError: .*"to"/s);

    const rows = await messageCount(stub, ws);
    expect(rows).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("leaves no row or R2 object when enqueue fails, so a same-key retry sends", async () => {
    const ws = "wsp_enqueue_fail";
    const stub = await seededStub(ws);
    const input = { ...base, idempotencyKey: "order:1:confirmation" };
    enqueue.mockRejectedValueOnce(new Error("queue down"));

    const failure = await runInDurableObject(stub, (instance) =>
      instance.send(ws, input).then(() => "resolved", (e: Error) => e.message),
    );
    expect(failure).toBe("queue_failed");

    const rows = await messageCount(stub, ws);
    expect(rows).toBe(0);
    expect((await env.MAIL.list({ prefix: `ws/${ws}/msg/` })).objects).toHaveLength(0);

    const retry = await stub.send(ws, input);
    expect(retry).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "queued", duplicate: false });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenLastCalledWith({ workspaceId: ws, messageId: retry.messageId });
  });

  it("keeps a marketing block when a transactional block lands on the same email", async () => {
    const ws = "wsp_widen";
    const stub = await seededStub(ws);
    await stub.addSuppression(ws, "w@x.com", "manual", "marketing");
    await stub.addSuppression(ws, "w@x.com", "manual", "transactional");

    const marketing = await stub.send(ws, { ...base, stream: "marketing", to: "w@x.com" });
    const transactional = await stub.send(ws, { ...base, stream: "transactional", to: "w@x.com" });

    expect(marketing.status).toBe("suppressed");
    expect(transactional.status).toBe("suppressed");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("scopes idempotency keys to the app within a workspace", async () => {
    const ws = "wsp_apps";
    const stub = await seededStub(ws);
    await seedOwnSender(ws, "app_b", "b@a6n.ai");
    const a = await stub.send(ws, { ...base, idempotencyKey: "order:1:confirmation" });
    const b = await stub.send(ws, { ...base, appId: "app_b", from: "b@a6n.ai", idempotencyKey: "order:1:confirmation" });

    expect(a).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "queued", duplicate: false });
    expect(b).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "queued", duplicate: false });
    expect(b.messageId).not.toBe(a.messageId);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("refuses a from address that another app in the same workspace owns", async () => {
    const ws = "wsp_cross_app";
    const stub = await seededStub(ws);

    expect(await settle(stub.send(ws, { ...base, appId: "app_other" }))).toEqual({ error: "sender_not_verified" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("settles a same-key caller that arrives during the enqueue with the same rejection and no row", async () => {
    const ws = "wsp_inflight_fail";
    const stub = await seededStub(ws);
    const input = { ...base, idempotencyKey: "order:1:confirmation" };
    const put = vi.spyOn(env.MAIL, "put");

    const [a, b] = await runInDurableObject(stub, async (instance) => {
      const gate = deferred();
      enqueue.mockImplementationOnce(() => gate.promise.then(() => ({}) as QueueSendResponse));
      const first = settle(instance.send(ws, input));
      await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
      const second = settle(instance.send(ws, input));
      await tick();
      gate.reject(new Error("queue down"));
      return Promise.all([first, second]);
    });

    expect(a).toEqual({ error: "queue_failed" });
    expect(b).toEqual({ error: "queue_failed" });
    expect(put).toHaveBeenCalledTimes(1);
    const rows = await messageCount(stub, ws);
    expect(rows).toBe(0);
    expect((await env.MAIL.list({ prefix: `ws/${ws}/msg/` })).objects).toHaveLength(0);
  });

  it("returns the first result as duplicate:true to a same-key caller that arrives during the enqueue", async () => {
    const ws = "wsp_inflight_ok";
    const stub = await seededStub(ws);
    const input = { ...base, idempotencyKey: "order:1:confirmation" };
    const put = vi.spyOn(env.MAIL, "put");

    const [a, b] = await runInDurableObject(stub, async (instance) => {
      const gate = deferred();
      enqueue.mockImplementationOnce(() => gate.promise.then(() => ({}) as QueueSendResponse));
      const first = settle(instance.send(ws, input));
      await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
      const second = settle(instance.send(ws, input));
      await tick();
      gate.resolve();
      return Promise.all([first, second]);
    });

    expect(a).toEqual({ value: { messageId: expect.stringMatching(/^msg_/), status: "queued", duplicate: false } });
    const messageId = (a as { value: { messageId: string } }).value.messageId;
    expect(b).toEqual({ value: { messageId, status: "queued", duplicate: true } });
    expect(put).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("suppresses a recipient who unsubscribes while the html is being stored", async () => {
    const ws = "wsp_race_sup";
    const stub = await seededStub(ws);

    const sent = await runInDurableObject(stub, async (instance) => {
      const realPut = env.MAIL.put.bind(env.MAIL);
      vi.spyOn(env.MAIL, "put").mockImplementationOnce(async (key, value) => {
        await instance.addSuppression(ws, base.to, "unsubscribe");
        return (await realPut(key, value)) as R2Object;
      });
      return instance.send(ws, base);
    });

    expect(sent).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "suppressed", duplicate: false });
    expect(enqueue).not.toHaveBeenCalled();
    expect((await env.MAIL.list({ prefix: `ws/${ws}/msg/` })).objects).toHaveLength(0);
    const view = await stub.getMessage(ws, sent.messageId);
    expect(view).toMatchObject({ status: "suppressed", html: null });
  });

  it("rejects a workspace id other than the one the DO is named for", async () => {
    const stub = stubFor("wsp_a");
    // RPC rejections surface as unhandled in this plugin, so the calls run inside the DO.
    const results = await runInDurableObject(stub, async (instance) => {
      const first = await instance.ping("wsp_b").then(() => "resolved", (e: Error) => e.message);
      await instance.ping("wsp_a");
      const second = await instance.ping("wsp_b").then(() => "resolved", (e: Error) => e.message);
      return [first, second];
    });
    expect(results).toEqual(["workspace mismatch", "workspace mismatch"]);
  });

  it("binds an unnamed DO to the workspace in KV", async () => {
    const stub = env.CLIENT.get(env.CLIENT.newUniqueId());
    const other = await runInDurableObject(stub, async (instance) => {
      await instance.ping("wsp_a");
      return instance.ping("wsp_b").then(() => "resolved", (e: Error) => e.message);
    });
    expect(other).toBe("workspace mismatch");
  });

  it("keeps one row per reason, widening the stream and keeping the first date on a repeat", async () => {
    const ws = "wsp_reason";
    const stub = await seededStub(ws);
    const rows = async () => (await stub.listSuppressions(ws, { prefix: "r@x.com" })).rows;

    await stub.addSuppression(ws, "r@x.com", "bounce");
    expect(await stub.addSuppression(ws, "r@x.com", "manual", "marketing")).toEqual({ created: true });
    const [, first] = await rows();
    expect(await stub.addSuppression(ws, "r@x.com", "manual", "transactional")).toEqual({ created: false });
    await stub.addSuppression(ws, "r@x.com", "manual", "marketing");

    expect((await rows()).map((r) => [r.reason, r.stream])).toEqual([
      ["bounce", null],
      ["manual", null],
    ]);
    expect((await rows())[1].createdAt).toBe(first.createdAt);
  });
});

describe("template sends", () => {
  async function template(ws: string, fields: { subject?: string; html?: string; text?: string; enabled?: boolean }) {
    const stub = await seededStub(ws);
    const tpl = (await stub.createTemplate(ws, "app_1", { name: "T", ...fields })) as { id: string };
    return { stub, id: tpl.id };
  }
  const send = (ws: string, templateId: string, extra: Record<string, unknown> = {}) =>
    sendTemplateMessage(env, { workspaceId: ws, appId: "app_1", userId: null, keyId: "key_1" }, { stream: "transactional", from: "Relay@A6n.ai", to: "a@x.com", templateId, ...extra });

  it("renders the template with the contact name escaped", async () => {
    const ws = "wsp_tpl_render_send";
    const { id } = await template(ws, { subject: "Hello {{contact.first_name}}", html: "<p>{{contact.first_name}}</p>", text: "{{contact.first_name}}" });
    const sent = await send(ws, id, { contact: { firstName: "<i>" } });
    expect(sent).toMatchObject({ status: "queued" });
    expect(await (await env.MAIL.get(`ws/${ws}/msg/${sent.messageId}.html`))?.text()).toBe("<p>&lt;i&gt;</p>");
  });

  it("refuses an unsubscribe link outside the marketing stream", async () => {
    const ws = "wsp_tpl_unsub_send";
    const { id } = await template(ws, { subject: "S", html: "<a>{{unsubscribe_url}}</a>", text: "{{unsubscribe_url}}" });
    await expect(send(ws, id)).rejects.toThrow("unsubscribe only on marketing");
  });

  it("refuses a disabled template, and another app's template as not found", async () => {
    const ws = "wsp_tpl_disabled_send";
    const { stub, id } = await template(ws, { subject: "S", html: "<p>x</p>", text: "x", enabled: false });
    await expect(send(ws, id)).rejects.toThrow("template disabled");
    await stub.updateTemplate(ws, id, { enabled: true });
    await expect(sendTemplateMessage(env, { workspaceId: ws, appId: "app_2", userId: null, keyId: "key_1" }, { stream: "transactional", from: "Relay@A6n.ai", to: "a@x.com", templateId: id })).rejects.toThrow(
      "template not found",
    );
  });

  it("sends one message for the same idempotency key", async () => {
    const ws = "wsp_tpl_idem_send";
    const { id } = await template(ws, { subject: "S", html: "<p>x</p>", text: "x" });
    const first = await send(ws, id, { idempotencyKey: "tpl-once" });
    const second = await send(ws, id, { idempotencyKey: "tpl-once" });
    expect(second).toMatchObject({ messageId: first.messageId, duplicate: true });
  });
});
