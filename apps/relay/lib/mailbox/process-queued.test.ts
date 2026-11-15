import { beforeEach, describe, expect, it, vi } from "vitest";

const { ingestInboundLetter, tenantForInbox } = vi.hoisted(() => ({
  ingestInboundLetter: vi.fn(),
  tenantForInbox: vi.fn(),
}));

vi.mock("@relay/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@relay/engine")>()),
  ingestInboundLetter,
}));
vi.mock("@/lib/mailbox/inbound-recipient", () => ({ tenantForInbox }));

const state = { inserts: [] as { table: unknown; values: Record<string, unknown> }[], deletes: [] as unknown[] };
const fakeDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ organizationId: "org_1" }] }) }) }),
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      state.inserts.push({ table, values });
      return { onConflictDoNothing: async () => undefined };
    },
  }),
  delete: (table: unknown) => ({
    where: async () => {
      state.deletes.push(table);
    },
  }),
  transaction: (cb: (tx: unknown) => Promise<unknown>): Promise<unknown> => cb(fakeDb),
};
vi.mock("@/db/client", () => ({ db: fakeDb }));

const { processQueuedInbound } = await import("./process-queued");
const { mailBucket } = await import("./mail-bucket");
const { mailboxInboundFailure } = await import("@/db/schema");

const RECEIVED = Date.UTC(2026, 10, 10, 9);
const rawKey = "mail/in/2026/11/raw1.eml";

const eml = [
  "From: Cust <cust@example.com>",
  "To: hello@a6n.ai",
  "Subject: Invoice",
  "Message-ID: <m1@example.com>",
  "Date: Tue, 10 Nov 2026 09:00:00 +0000",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b"',
  "",
  "--b",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hello",
  "--b",
  'Content-Type: application/pdf; name="inv.pdf"',
  'Content-Disposition: attachment; filename="inv.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from("PDFDATA").toString("base64"),
  "--b--",
  "",
].join("\r\n");

const msg = {
  rawId: "raw1",
  rawKey,
  envelopeFrom: "bounce@out.test",
  envelopeTo: "hello@a6n.ai",
  authResults: "dmarc=pass",
  receivedAt: RECEIVED,
};

async function storeRaw(body: string) {
  await mailBucket().put(rawKey, new TextEncoder().encode(body));
}

async function keys(prefix: string) {
  return (await mailBucket().list({ prefix })).objects.map((o) => o.key);
}

describe("processQueuedInbound", () => {
  beforeEach(async () => {
    const bucket = mailBucket();
    await bucket.delete((await bucket.list({ prefix: "mail/" })).objects.map((o) => o.key));
    ingestInboundLetter.mockReset();
    tenantForInbox.mockReset().mockResolvedValue(7n);
    state.inserts.length = 0;
    state.deletes.length = 0;
  });

  it("writes attachment keys from rawId and passes the rows into the letter transaction", async () => {
    await storeRaw(eml);
    ingestInboundLetter.mockResolvedValue({ status: "inserted", id: 1n, publicId: "eml_1" });

    expect(await processQueuedInbound(msg)).toEqual({ outcome: "inserted" });

    expect(await keys("mail/att/raw1/")).toEqual(["mail/att/raw1/0-inv.pdf"]);
    const [, , , opts] = ingestInboundLetter.mock.calls[0];
    expect(opts.recipientTenantId).toBe(7n);
    expect(opts.attachments).toEqual([
      {
        publicId: expect.stringMatching(/^att_/),
        position: 0,
        filename: "inv.pdf",
        contentType: "application/pdf",
        sizeBytes: 7,
        contentId: null,
        storageKey: "mail/att/raw1/0-inv.pdf",
      },
    ]);
    expect(state.deletes).toEqual([mailboxInboundFailure]);
  });

  it("uses the message receivedAt as created_at and the raw key", async () => {
    await storeRaw(eml);
    ingestInboundLetter.mockResolvedValue({ status: "inserted", id: 1n, publicId: "eml_1" });

    await processQueuedInbound(msg);

    expect(ingestInboundLetter.mock.calls[0][3]).toMatchObject({ receivedAt: RECEIVED, rawKey, authResults: "dmarc=pass" });
  });

  it("overwrites the same keys when a retried parse runs again", async () => {
    await storeRaw(eml);
    ingestInboundLetter.mockResolvedValue({ status: "inserted", id: 1n, publicId: "eml_1" });

    await processQueuedInbound(msg);
    await processQueuedInbound(msg);

    expect(await keys("mail/att/raw1/")).toEqual(["mail/att/raw1/0-inv.pdf"]);
  });

  it("deletes nothing when the duplicate has the same raw key", async () => {
    await storeRaw(eml);
    ingestInboundLetter.mockResolvedValue({ status: "duplicate", existingRawKey: rawKey });

    expect(await processQueuedInbound(msg)).toEqual({ outcome: "duplicate" });

    expect((await keys("mail/")).sort()).toEqual([rawKey, "mail/att/raw1/0-inv.pdf"].sort());
  });

  it("deletes the new eml and its attachment prefix when the duplicate has a different raw key", async () => {
    await storeRaw(eml);
    ingestInboundLetter.mockResolvedValue({ status: "duplicate", existingRawKey: "mail/in/2026/10/old.eml" });

    expect(await processQueuedInbound(msg)).toEqual({ outcome: "duplicate" });

    expect(await keys("mail/")).toEqual([]);
  });

  it("writes one failure row for a permanent parse error and keeps the raw mail", async () => {
    await storeRaw(eml.replace("Message-ID: <m1@example.com>\r\n", ""));

    expect(await processQueuedInbound(msg)).toEqual({ outcome: "failed" });

    expect(ingestInboundLetter).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe(mailboxInboundFailure);
    expect(state.inserts[0].values).toMatchObject({
      rawKey,
      error: "Missing Message-ID",
      attempts: 1,
      tenantId: 7n,
      organizationId: "org_1",
    });
    expect(await keys("mail/in/")).toEqual([rawKey]);
  });

  it("writes a failure row when the recipient mailbox is gone", async () => {
    await storeRaw(eml);
    tenantForInbox.mockResolvedValue(null);

    expect(await processQueuedInbound(msg)).toEqual({ outcome: "failed" });

    expect(state.inserts[0].values).toMatchObject({ error: "No such mailbox", tenantId: null, organizationId: null });
  });

  it("deletes the failure row after a successful letter", async () => {
    await storeRaw(eml);
    ingestInboundLetter.mockResolvedValue({ status: "inserted", id: 1n, publicId: "eml_1" });

    await processQueuedInbound(msg);

    expect(state.deletes).toEqual([mailboxInboundFailure]);
    expect(state.inserts).toHaveLength(0);
  });

  it("rethrows a transient error so the consumer retries", async () => {
    await storeRaw(eml);
    ingestInboundLetter.mockRejectedValue(new Error("db down"));

    await expect(processQueuedInbound(msg)).rejects.toThrow("db down");
    expect(state.inserts).toHaveLength(0);
  });
});
