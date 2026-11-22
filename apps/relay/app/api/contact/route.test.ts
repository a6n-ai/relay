import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@relay/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@relay/engine")>()),
  ingestInboundLetter: vi.fn(async () => ({ status: "stored" })),
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ notificationTables: {} }));
vi.mock("@/lib/mailbox/inbound-recipient", () => ({ tenantForInbox: vi.fn(async () => 7n) }));
vi.mock("@/lib/contact/guards", () => ({
  verifyTurnstile: vi.fn(async () => true),
  allowContact: vi.fn(async () => true),
}));

const { POST } = await import("./route");
const { ingestInboundLetter } = await import("@relay/engine");
const { tenantForInbox } = await import("@/lib/mailbox/inbound-recipient");
const { verifyTurnstile, allowContact } = await import("@/lib/contact/guards");

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  company: "Acme",
  volume: "under_10k",
  message: "We would like to talk about relay for our team.",
  token: "turnstile-token",
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://relay.a6n.ai/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/contact", () => {
  const originalInbox = process.env.CONTACT_INBOX;

  beforeEach(() => {
    process.env.CONTACT_INBOX = "hi@a6n.ai";
    vi.mocked(ingestInboundLetter).mockClear();
    vi.mocked(tenantForInbox).mockClear();
    vi.mocked(verifyTurnstile).mockClear().mockResolvedValue(true);
    vi.mocked(allowContact).mockClear().mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalInbox === undefined) delete process.env.CONTACT_INBOX;
    else process.env.CONTACT_INBOX = originalInbox;
  });

  it("saves a valid submission into the inbox app", async () => {
    const res = await POST(request(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(tenantForInbox).toHaveBeenCalledWith("hi@a6n.ai");
    expect(ingestInboundLetter).toHaveBeenCalledTimes(1);
    const [, , letter, opts] = vi.mocked(ingestInboundLetter).mock.calls[0] as unknown as [
      unknown,
      unknown,
      { toEmail: string; fromEmail: string },
      { recipientTenantId: bigint; authResults: null },
    ];
    expect(letter.toEmail).toBe("hi@a6n.ai");
    expect(letter.fromEmail).toBe("ada@example.com");
    expect(opts).toMatchObject({ recipientTenantId: 7n, authResults: null });
  });

  it("answers a filled honeypot with 200 and does nothing else", async () => {
    const res = await POST(request({ ...valid, website: "http://spam.example" }));
    expect(res.status).toBe(200);
    expect(ingestInboundLetter).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("rejects an invalid body with 400 and saves nothing", async () => {
    const res = await POST(request({ ...valid, email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(ingestInboundLetter).not.toHaveBeenCalled();
  });

  it("rejects a body over 16 KB with 413", async () => {
    const res = await POST(request("x".repeat(16_385)));
    expect(res.status).toBe(413);
    expect(ingestInboundLetter).not.toHaveBeenCalled();
  });

  it("rejects a failed Turnstile check with 400", async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    const res = await POST(request(valid));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ title: "Verification failed" });
    expect(ingestInboundLetter).not.toHaveBeenCalled();
  });

  it("rate limits with 429", async () => {
    vi.mocked(allowContact).mockResolvedValue(false);
    const res = await POST(request(valid));
    expect(res.status).toBe(429);
    expect(allowContact).toHaveBeenCalledWith("203.0.113.9");
    expect(ingestInboundLetter).not.toHaveBeenCalled();
  });

  it("returns 503 when the inbox is held by no app or by two", async () => {
    vi.mocked(tenantForInbox).mockResolvedValueOnce(null);
    const res = await POST(request(valid));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ title: "Contact is unavailable right now" });
    expect(ingestInboundLetter).not.toHaveBeenCalled();
  });

  it("returns 503 when CONTACT_INBOX is unset", async () => {
    delete process.env.CONTACT_INBOX;
    const res = await POST(request(valid));
    expect(res.status).toBe(503);
    expect(tenantForInbox).not.toHaveBeenCalled();
    expect(ingestInboundLetter).not.toHaveBeenCalled();
  });
});
