import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { signWebhookBody } from "@/lib/webhooks/sign";
import { signedInternalRoute } from "./signed-internal-route";

const secret = "test-secret";
const handle = vi.fn(async () => Response.json({ ok: true }));
const POST = signedInternalRoute(z.object({ padding: z.string().optional() }), handle);

const request = (body: BodyInit, init: RequestInit = {}) =>
  new Request("https://internal/api/internal/mailbox/inbound/queued", { method: "POST", body, ...init });

describe("signedInternalRoute body cap", () => {
  beforeEach(() => {
    process.env.MAILBOX_INBOUND_SECRET = secret;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.MAILBOX_INBOUND_SECRET;
  });

  it("accepts a signed body at the 64 KiB cap", async () => {
    const raw = JSON.stringify({ padding: "x".repeat(65_536 - 20) });
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(65_536);
    const res = await POST(request(raw, { headers: { "x-relay-signature": signWebhookBody(secret, raw) } }));
    expect(res.status).toBe(200);
    expect(handle).toHaveBeenCalled();
  });

  it("returns 413 for a signed body over the cap, before processing", async () => {
    const raw = JSON.stringify({ padding: "x".repeat(70 * 1024) });
    const res = await POST(request(raw, { headers: { "x-relay-signature": signWebhookBody(secret, raw) } }));
    expect(res.status).toBe(413);
    expect(handle).not.toHaveBeenCalled();
  });

  it("returns 413 for a chunked body with no length that goes over the cap", async () => {
    const chunk = new TextEncoder().encode("x".repeat(30 * 1024));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        for (let i = 0; i < 4; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const res = await POST(request(stream, { duplex: "half", headers: { "x-relay-signature": "bad" } } as RequestInit));
    expect(res.status).toBe(413);
    expect(handle).not.toHaveBeenCalled();
  });
});
