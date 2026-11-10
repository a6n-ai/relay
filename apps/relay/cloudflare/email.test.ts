import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MAX_BYTES, receive } from "./email.js";

const EML = "From: a@out.test\r\nTo: hello@a6n.ai\r\nSubject: Hi\r\nMessage-ID: <1@out.test>\r\n\r\nhello";

function letter(raw = EML, rawSize = raw.length) {
  return { raw: new Response(raw).body, rawSize, setReject: vi.fn() };
}

function env(res: Response) {
  return { MAILBOX_INBOUND_SECRET: "k", WORKER_SELF_REFERENCE: { fetch: vi.fn(async () => res) } };
}

describe("receive", () => {
  it("rejects a letter over 256 KB without calling the app", async () => {
    const m = letter(EML, MAX_BYTES + 1);
    const e = env(new Response("{}"));
    await receive(m, e);
    expect(MAX_BYTES).toBe(256 * 1024);
    expect(m.setReject).toHaveBeenCalledWith("Letter is larger than 256 KB");
    expect(e.WORKER_SELF_REFERENCE.fetch).not.toHaveBeenCalled();
  });

  it("posts the raw letter to the inbound route, signed like signWebhookBody", async () => {
    const m = letter();
    const e = env(Response.json({ ok: true }));
    await receive(m, e);
    const [url, init] = e.WORKER_SELF_REFERENCE.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://internal/api/internal/mailbox/inbound");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(EML);
    expect((init.headers as Record<string, string>)["x-relay-signature"]).toBe(
      createHmac("sha256", "k").update(EML).digest("hex"),
    );
    expect(m.setReject).not.toHaveBeenCalled();
  });

  it("bounces when the app refuses or fails, so the sender is not left in silence", async () => {
    for (const status of [401, 500]) {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const m = letter();
      await receive(m, env(new Response("x", { status })));
      expect(m.setReject).toHaveBeenCalledWith("Mailbox unavailable, try later");
    }
  });

  it("accepts a duplicate quietly", async () => {
    const m = letter();
    await receive(m, env(Response.json({ ok: true, duplicate: true })));
    expect(m.setReject).not.toHaveBeenCalled();
  });
});
