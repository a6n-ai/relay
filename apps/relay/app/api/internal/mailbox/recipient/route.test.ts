import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signWebhookBody } from "@/lib/webhooks/sign";

const tenantForInbox = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mailbox/inbound-recipient", () => ({ tenantForInbox }));

const { POST } = await import("./route");

const secret = "recipient-test-secret";
const call = (raw: string, signature: string | null) =>
  POST(
    new Request("https://internal/api/internal/mailbox/recipient", {
      method: "POST",
      headers: signature ? { "x-relay-signature": signature } : {},
      body: raw,
    }),
  );

describe("POST /api/internal/mailbox/recipient", () => {
  beforeEach(() => {
    process.env.MAILBOX_INBOUND_SECRET = secret;
    tenantForInbox.mockReset();
  });

  afterEach(() => {
    delete process.env.MAILBOX_INBOUND_SECRET;
  });

  it("rejects a bad signature", async () => {
    const raw = JSON.stringify({ envelopeTo: "hello@a6n.ai" });
    expect((await call(raw, null)).status).toBe(401);
    expect((await call(raw, signWebhookBody("wrong", raw))).status).toBe(401);
    expect(tenantForInbox).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown mailbox", async () => {
    tenantForInbox.mockResolvedValue(null);
    const raw = JSON.stringify({ envelopeTo: "nobody@a6n.ai" });

    const res = await call(raw, signWebhookBody(secret, raw));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ title: "No such mailbox" });
  });

  it("returns 200 for a known mailbox", async () => {
    tenantForInbox.mockResolvedValue(7n);
    const raw = JSON.stringify({ envelopeTo: "hello@a6n.ai" });

    const res = await call(raw, signWebhookBody(secret, raw));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(tenantForInbox).toHaveBeenCalledWith("hello@a6n.ai");
  });
});
