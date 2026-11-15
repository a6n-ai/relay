import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BYTES, receive } from "./email.js";

// workerd-only global; a pass-through stand-in is enough to exercise the pipe.
vi.stubGlobal(
  "FixedLengthStream",
  class {
    readable: ReadableStream;
    writable: WritableStream;
    constructor() {
      const t = new TransformStream();
      this.readable = t.readable;
      this.writable = t.writable;
    }
  },
);

const EML = "From: a@out.test\r\nTo: hello@a6n.ai\r\nSubject: Hi\r\nMessage-ID: <1@out.test>\r\n\r\nhello";
const AUTH = "mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass";

function letter(raw = EML, rawSize = raw.length, auth = AUTH) {
  return {
    raw: new Response(raw).body,
    rawSize,
    from: "bounce@out.test",
    to: "hello@a6n.ai",
    headers: new Headers({ "authentication-results": auth }),
    setReject: vi.fn(),
  };
}

function env(res: Response = Response.json({ ok: true })) {
  return {
    MAILBOX_INBOUND_SECRET: "k",
    WORKER_SELF_REFERENCE: { fetch: vi.fn(async () => res) },
    MAIL: {
      put: vi.fn(async (_key: string, _body: unknown) => {}),
      delete: vi.fn(async (_key: string) => {}),
    },
    INBOUND: { send: vi.fn(async (_msg: Record<string, unknown>) => {}) },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("receive", () => {
  it("rejects a letter over 25 MiB without calling the app or R2", async () => {
    const m = letter(EML, MAX_BYTES + 1);
    const e = env();
    await receive(m, e);
    expect(m.setReject).toHaveBeenCalledWith("Message is larger than 25 MiB");
    expect(e.WORKER_SELF_REFERENCE.fetch).not.toHaveBeenCalled();
    expect(e.MAIL.put).not.toHaveBeenCalled();
  });

  it("rejects a letter that fails DMARC without calling the app", async () => {
    const m = letter(EML, EML.length, "mx.cloudflare.net; spf=fail; dkim=none; dmarc=fail header.from=bank.test");
    const e = env();
    await receive(m, e);
    expect(m.setReject).toHaveBeenCalledWith("Message failed DMARC");
    expect(e.WORKER_SELF_REFERENCE.fetch).not.toHaveBeenCalled();
  });

  it("checks the recipient with a signed JSON body and writes nothing when the mailbox is unknown", async () => {
    const m = letter();
    const e = env(new Response("{}", { status: 404 }));
    await receive(m, e);
    const [url, init] = e.WORKER_SELF_REFERENCE.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://internal/api/internal/mailbox/recipient");
    expect(init.body).toBe(JSON.stringify({ envelopeTo: "hello@a6n.ai" }));
    expect((init.headers as Record<string, string>)["x-relay-signature"]).toBe(
      createHmac("sha256", "k").update(init.body as string).digest("hex"),
    );
    expect(m.setReject).toHaveBeenCalledWith("No such mailbox");
    expect(e.MAIL.put).not.toHaveBeenCalled();
    expect(e.INBOUND.send).not.toHaveBeenCalled();
  });

  it("bounces when the recipient check fails with any other status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [401, 500]) {
      const m = letter();
      await receive(m, env(new Response("x", { status })));
      expect(m.setReject).toHaveBeenCalledWith("Mailbox unavailable");
    }
  });

  it("stores the raw letter in R2 and queues it with all six fields", async () => {
    const m = letter();
    const e = env();
    await receive(m, e);
    expect(m.setReject).not.toHaveBeenCalled();
    expect(e.MAIL.put).toHaveBeenCalledTimes(1);
    expect(e.INBOUND.send).toHaveBeenCalledTimes(1);
    const msg = e.INBOUND.send.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(msg).sort()).toEqual(
      ["authResults", "envelopeFrom", "envelopeTo", "rawId", "rawKey", "receivedAt"].sort(),
    );
    expect(msg).toEqual({
      rawId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      rawKey: `mail/in/2026/11/${msg.rawId}.eml`,
      envelopeFrom: "bounce@out.test",
      envelopeTo: "hello@a6n.ai",
      authResults: AUTH,
      receivedAt: Date.parse("2026-11-15T10:00:00Z"),
    });
    expect(e.MAIL.put.mock.calls[0][0]).toBe(msg.rawKey);
  });

  it("rejects and writes no queue message when the R2 put fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = letter();
    const e = env();
    e.MAIL.put.mockRejectedValueOnce(new Error("r2 down"));
    await receive(m, e);
    expect(m.setReject).toHaveBeenCalledWith("Mailbox unavailable");
    expect(e.INBOUND.send).not.toHaveBeenCalled();
  });

  it("deletes the stored object and rejects when the queue send fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = letter();
    const e = env();
    e.INBOUND.send.mockRejectedValueOnce(new Error("queue down"));
    await receive(m, e);
    const rawKey = e.MAIL.put.mock.calls[0][0];
    expect(e.MAIL.delete).toHaveBeenCalledWith(rawKey);
    expect(m.setReject).toHaveBeenCalledWith("Mailbox unavailable");
  });
});
