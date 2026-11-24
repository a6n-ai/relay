import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
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

describe("ClientDO send", () => {
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

    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM message").toArray()[0].n,
    );
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

    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM message").toArray()[0].n,
    );
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
    const a = await stub.send(ws, { ...base, appId: "app_a", idempotencyKey: "order:1:confirmation" });
    const b = await stub.send(ws, { ...base, appId: "app_b", idempotencyKey: "order:1:confirmation" });

    expect(a).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "queued", duplicate: false });
    expect(b).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "queued", duplicate: false });
    expect(b.messageId).not.toBe(a.messageId);
    expect(enqueue).toHaveBeenCalledTimes(2);
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
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM message").toArray()[0].n,
    );
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
    const bound = await runInDurableObject(stub, (_instance, state) => state.storage.kv.get("workspace_id"));
    expect(bound).toBe("wsp_a");
  });

  it("keeps the higher-ranked suppression reason when an email is suppressed again", async () => {
    const ws = "wsp_reason";
    const stub = await seededStub(ws);
    const reason = () =>
      runInDurableObject(stub, (_instance, state) =>
        state.storage.sql.exec<{ reason: string }>("SELECT reason FROM suppression WHERE email = ?", "r@x.com").one().reason,
      );

    await stub.addSuppression(ws, "r@x.com", "bounce");
    await stub.addSuppression(ws, "r@x.com", "manual");
    expect(await reason()).toBe("bounce");

    await stub.addSuppression(ws, "r@x.com", "complaint");
    expect(await reason()).toBe("complaint");
  });
});
