import { applyD1Migrations, env, runInDurableObject, type D1Migration } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const base = {
  appId: "app_1",
  stream: "transactional" as const,
  from: "Relay@A6n.ai",
  to: "a@x.com",
  subject: "Order 1",
  html: "<p>Thanks</p>",
  text: "Thanks",
};

const { TEST_MIGRATIONS } = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };

const stubFor = (workspaceId: string) => env.CLIENT.get(env.CLIENT.idFromName(workspaceId));

let enqueue: MockInstance<typeof env.SEND.send>;

beforeAll(async () => {
  await applyD1Migrations(env.CENTRAL, TEST_MIGRATIONS);
});

beforeEach(() => {
  enqueue = vi.spyOn(env.SEND, "send");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClientDO send", () => {
  it("queues a message, stores html in R2 and enqueues one send job", async () => {
    const ws = "wsp_test";
    const stub = stubFor(ws);
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
    const stub = stubFor(ws);
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
    const stub = stubFor(ws);
    await stub.addSuppression(ws, "a@x.com", "unsubscribe");
    const sent = await stub.send(ws, { ...base, to: " A@X.com " });

    expect(sent).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "suppressed", duplicate: false });
    expect(await env.MAIL.get(`ws/${ws}/msg/${sent.messageId}.html`)).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("blocks only the suppressed stream", async () => {
    const ws = "wsp_stream";
    const stub = stubFor(ws);
    await stub.addSuppression(ws, "m@x.com", "manual", "marketing");

    const marketing = await stub.send(ws, { ...base, stream: "marketing", to: "m@x.com" });
    const transactional = await stub.send(ws, { ...base, stream: "transactional", to: "m@x.com" });

    expect(marketing.status).toBe("suppressed");
    expect(transactional.status).toBe("queued");
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input and writes nothing", async () => {
    const ws = "wsp_invalid";
    const stub = stubFor(ws);
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
    const stub = stubFor(ws);
    const input = { ...base, idempotencyKey: "order:1:confirmation" };
    enqueue.mockRejectedValueOnce(new Error("queue down"));

    const failure = await runInDurableObject(stub, (instance) =>
      instance.send(ws, input).then(() => "resolved", (e: Error) => e.message),
    );
    expect(failure).toBe("queue down");

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
    const stub = stubFor(ws);
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
    const stub = stubFor(ws);
    const a = await stub.send(ws, { ...base, appId: "app_a", idempotencyKey: "order:1:confirmation" });
    const b = await stub.send(ws, { ...base, appId: "app_b", idempotencyKey: "order:1:confirmation" });

    expect(a).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "queued", duplicate: false });
    expect(b).toEqual({ messageId: expect.stringMatching(/^msg_/), status: "queued", duplicate: false });
    expect(b.messageId).not.toBe(a.messageId);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});
