import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signWebhookBody } from "@/lib/webhooks/sign";

const processQueuedInbound = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/mailbox/process-queued", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mailbox/process-queued")>()),
  processQueuedInbound: (msg: unknown) => processQueuedInbound(msg),
}));

const { POST } = await import("./route");

const secret = "queued-test-secret";
const message = {
  rawId: "raw1",
  rawKey: "mail/in/2026/11/raw1.eml",
  envelopeFrom: "bounce@out.test",
  envelopeTo: "hello@a6n.ai",
  authResults: null,
  receivedAt: 1_700_000_000_000,
};

const call = (raw: string, signature: string | null) =>
  POST(
    new Request("https://internal/api/internal/mailbox/inbound/queued", {
      method: "POST",
      headers: signature ? { "x-relay-signature": signature } : {},
      body: raw,
    }),
  );

describe("POST /api/internal/mailbox/inbound/queued", () => {
  beforeEach(() => {
    process.env.MAILBOX_INBOUND_SECRET = secret;
    processQueuedInbound.mockResolvedValue({ outcome: "inserted" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.MAILBOX_INBOUND_SECRET;
  });

  it("rejects a bad signature without processing", async () => {
    const raw = JSON.stringify(message);
    expect((await call(raw, null)).status).toBe(401);
    expect((await call(raw, signWebhookBody("wrong", raw))).status).toBe(401);
    expect(processQueuedInbound).not.toHaveBeenCalled();
  });

  it("rejects an oversized signed queue message with 413 before processing", async () => {
    const raw = JSON.stringify({ ...message, padding: "x".repeat(70 * 1024) });
    const res = await call(raw, signWebhookBody(secret, raw));
    expect(res.status).toBe(413);
    expect(processQueuedInbound).not.toHaveBeenCalled();
  });
});
