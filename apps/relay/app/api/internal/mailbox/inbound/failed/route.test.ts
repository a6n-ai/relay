import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signWebhookBody } from "@/lib/webhooks/sign";

const { insert, onConflictDoUpdate } = vi.hoisted(() => ({
  insert: vi.fn(),
  onConflictDoUpdate: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
    insert: (table: unknown) => {
      insert(table);
      return { values: () => ({ onConflictDoUpdate }) };
    },
  },
}));
vi.mock("@/lib/mailbox/inbound-recipient", () => ({ tenantForInbox: async () => 7n }));

const { POST } = await import("./route");
const { mailboxInboundFailure } = await import("@/db/schema");

const secret = "failed-test-secret";
const body = {
  message: {
    rawId: "raw1",
    rawKey: "mail/in/2026/11/raw1.eml",
    envelopeFrom: "bounce@out.test",
    envelopeTo: "hello@a6n.ai",
    authResults: null,
    receivedAt: 1_700_000_000_000,
  },
  attempts: 3,
  error: "Missing Message-ID",
};

const call = (raw: string) =>
  POST(
    new Request("https://internal/api/internal/mailbox/inbound/failed", {
      method: "POST",
      headers: { "x-relay-signature": signWebhookBody(secret, raw) },
      body: raw,
    }),
  );

describe("POST /api/internal/mailbox/inbound/failed", () => {
  beforeEach(() => {
    process.env.MAILBOX_INBOUND_SECRET = secret;
    insert.mockClear();
    onConflictDoUpdate.mockClear();
  });

  afterEach(() => {
    delete process.env.MAILBOX_INBOUND_SECRET;
  });

  it("inserts the failure on the raw key and updates the same row on a repeat", async () => {
    const raw = JSON.stringify(body);

    expect((await call(raw)).status).toBe(200);
    expect((await call(raw)).status).toBe(200);

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledWith(mailboxInboundFailure);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(2);
    expect(onConflictDoUpdate).toHaveBeenCalledWith({ target: mailboxInboundFailure.rawKey, set: expect.any(Object) });
  });
});
