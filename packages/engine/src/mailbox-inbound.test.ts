import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bigint, pgTable, text } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MAX_MAILBOX_INBOUND_BYTES,
  MailboxInboundError,
  inboundSnsDecision,
  ingestInboundLetter,
  parseMailboxEml,
  parseMailboxInbound,
} from "./mailbox-inbound";
import { makeTenantNotificationTables } from "./tenant-schema";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "mailbox/fixtures");
const tenants = pgTable("tenants", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const mailboxes = pgTable("tenant_mailboxes", { id: bigint("id", { mode: "bigint" }).primaryKey(), tenantId: bigint("tenant_id", { mode: "bigint" }), email: text("email") });
const tables = makeTenantNotificationTables({ tenants, mailboxes });

function readFixture(name: string): string {
  return readFileSync(join(fixtures, name), "utf8");
}

describe("parseMailboxInbound", () => {
  it("parses a simple JSON reply with angle-bracket ids", async () => {
    const letter = await parseMailboxInbound(readFixture("reply-simple.json"));
    expect(letter.fromEmail).toBe("cust@example.com");
    expect(letter.toEmail).toBe("ops@relay.local");
    expect(letter.text).toContain("Thanks");
    expect(letter.inReplyTo).toBe("<abc@relay.test>");
    expect(letter.rfcMessageId).toBe("<reply-1@example.com>");
  });

  it("stores HTML as a plain string (no DOM)", async () => {
    const letter = await parseMailboxInbound(readFixture("reply-html-text.json"));
    expect(typeof letter.html).toBe("string");
    expect(letter.html).toBe("<p>Thanks</p>");
    expect(letter.text).toBe("Thanks");
  });

  it("allows text-only letters", async () => {
    const letter = await parseMailboxInbound(readFixture("missing-html.json"));
    expect(letter.html).toBe("");
    expect(letter.text).toBe("Plain only");
  });

  it("decodes an encoded Subject on .eml", async () => {
    const letter = await parseMailboxInbound(readFixture("encoded-subject.eml"));
    expect(letter.subject).toBe("Re: Order ready");
    expect(letter.fromName).toBe("Customer");
  });

  it("decodes a Gmail multipart/alternative quoted-printable reply", async () => {
    const letter = await parseMailboxInbound(readFixture("gmail-reply-multipart.eml"));
    expect(letter.fromName).toBe("Vishwas Saini");
    expect(letter.fromEmail).toBe("sender@example.com");
    expect(letter.text).toContain("hello");
    expect(letter.text).toContain("\u{1F4F1}");
    expect(letter.text).not.toMatch(/Content-Type:|--b1|=3D|=F0/);
    expect(letter.html).toContain('<div dir="ltr">hello</div>');
    const ses = "<0109019a1b2c3d4e-11111111-2222-3333-4444-555555555555-000000@ap-south-1.amazonses.com>";
    expect(letter.inReplyTo).toBe(ses);
    expect(letter.rfcReferences).toBe(ses);
  });

  it("decodes nested mixed/alternative base64 and ignores the attachment", async () => {
    const letter = await parseMailboxInbound(readFixture("nested-mixed-base64.eml"));
    expect(letter.text).toContain("hello nested \u{1F4F1}");
    expect(letter.html).toContain("<p>hello nested</p>");
    expect(letter.text).not.toContain("attachment-bytes");
    expect(letter.text).not.toContain("Content-Type:");
  });

  it("keeps Message-IDs from the angle-ids fixture", async () => {
    const letter = await parseMailboxInbound(readFixture("angle-ids.json"));
    expect(letter.rfcMessageId).toBe("reply-bare@example.com");
    expect(letter.rfcReferences).toContain("<root@relay.test>");
  });

  it("throws a typed error when over the size cap", async () => {
    const raw = `{${"x".repeat(MAX_MAILBOX_INBOUND_BYTES)}}`;
    const err = await parseMailboxInbound(raw).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailboxInboundError);
    expect((err as MailboxInboundError).code).toBe("too_large");
    expect((err as MailboxInboundError).status).toBe(413);
  });

  it("rejects missing From/To and empty body", async () => {
    await expect(
      parseMailboxInbound(JSON.stringify({ to: "a@b.com", subject: "x", text: "y", rfcMessageId: "<1@x>" })),
    ).rejects.toThrow(MailboxInboundError);
    await expect(
      parseMailboxInbound(JSON.stringify({ from: "a@b.com", to: "b@c.com", subject: "x", rfcMessageId: "<1@x>" })),
    ).rejects.toThrow(MailboxInboundError);
  });
});

describe("inboundSnsDecision", () => {
  it("does not treat SubscribeURL as something to fetch", async () => {
    const raw = JSON.stringify({
      Type: "SubscriptionConfirmation",
      Message: "confirm",
      SubscribeURL: "https://example.invalid/confirm",
    });
    expect(inboundSnsDecision(raw)).toEqual({ kind: "subscription" });
  });

  it("unwraps Notification and ignores other types", async () => {
    expect(inboundSnsDecision(JSON.stringify({ Type: "Notification", Message: "{\"ok\":true}" }))).toEqual({
      kind: "notification",
      message: "{\"ok\":true}",
    });
    expect(inboundSnsDecision(JSON.stringify({ Type: "UnsubscribeConfirmation", Message: "x" }))).toEqual({
      kind: "ignore",
    });
  });
});

describe("ingestInboundLetter", () => {
  it("attaches In-Reply-To to the outbound thread_id", async () => {
    const inserted: unknown[] = [];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ tenantId: 9n, threadId: "<abc@relay.test>" }],
          }),
        }),
      }),
      insert: () => ({
        values: (v: unknown) => {
          inserted.push(v);
          return {
            onConflictDoNothing: () => ({
              returning: async () => [{ publicId: "mbx_in" }],
            }),
          };
        },
      }),
    };
    const parsed = await parseMailboxInbound(readFixture("reply-simple.json"));
    const result = await ingestInboundLetter(db as never, tables, parsed);
    expect(result).toMatchObject({ status: "inserted", publicId: "mbx_in" });
    expect(inserted[0]).toMatchObject({
      direction: "in",
      threadId: "<abc@relay.test>",
      tenantId: 9n,
      rfcMessageId: "<reply-1@example.com>",
    });
  });

  it("opens a new thread from its own Message-ID when the parent is unknown", async () => {
    const inserted: unknown[] = [];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: (v: unknown) => {
          inserted.push(v);
          return {
            onConflictDoNothing: () => ({
              returning: async () => [{ publicId: "mbx_in" }],
            }),
          };
        },
      }),
    };
    const parsed = await parseMailboxInbound(readFixture("reply-simple.json"));
    await ingestInboundLetter(db as never, tables, parsed);
    expect(inserted[0]).toMatchObject({
      threadId: "<reply-1@example.com>",
      tenantId: null,
    });
  });

  it("joins the outbound thread when In-Reply-To names the SES message id", async () => {
    const inserted: unknown[] = [];
    const parent = [{ tenantId: 9n, threadId: "<relay-1@relay.invalid>" }];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
          innerJoin: () => ({ where: () => ({ limit: async () => parent }) }),
        }),
      }),
      insert: () => ({
        values: (v: unknown) => {
          inserted.push(v);
          return { onConflictDoNothing: () => ({ returning: async () => [{ publicId: "mbx_in" }] }) };
        },
      }),
    };
    const parsed = await parseMailboxInbound(readFixture("gmail-reply-multipart.eml"));
    await ingestInboundLetter(db as never, tables, parsed);
    expect(inserted[0]).toMatchObject({ threadId: "<relay-1@relay.invalid>", tenantId: 9n });
  });

  it("is idempotent on duplicate Message-ID", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [],
          }),
        }),
      }),
    };
    const parsed = await parseMailboxInbound(readFixture("reply-simple.json"));
    expect(await ingestInboundLetter(db as never, tables, parsed)).toMatchObject({
      status: "duplicate",
      existingRawKey: null,
    });
  });
});

describe("ingestInboundLetter with a known recipient app", () => {
  function fakeDb(parentTenantId: bigint) {
    const inserted: Record<string, unknown>[] = [];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ tenantId: parentTenantId, threadId: "<abc@relay.test>" }] }),
        }),
      }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserted.push(v);
          return { onConflictDoNothing: () => ({ returning: async () => [{ publicId: "mbx_in" }] }) };
        },
      }),
    };
    return { db, inserted };
  }

  it("keeps a reply in the parent thread when that thread belongs to the recipient's app", async () => {
    const { db, inserted } = fakeDb(9n);
    await ingestInboundLetter(db as never, tables, await parseMailboxInbound(readFixture("reply-simple.json")), {
      recipientTenantId: 9n,
    });
    expect(inserted[0]).toMatchObject({ threadId: "<abc@relay.test>", tenantId: 9n });
  });

  it("starts a new thread when References point at another app's thread", async () => {
    const { db, inserted } = fakeDb(9n);
    await ingestInboundLetter(db as never, tables, await parseMailboxInbound(readFixture("reply-simple.json")), {
      recipientTenantId: 5n,
    });
    expect(inserted[0]).toMatchObject({ threadId: "<reply-1@example.com>", tenantId: 5n });
  });
});

describe("parseMailboxEml", () => {
  it("accepts raw bytes", async () => {
    const bytes = new TextEncoder().encode(readFixture("gmail-reply-multipart.eml"));
    const letter = await parseMailboxEml(bytes);
    expect(letter.fromEmail).toBe("sender@example.com");
    expect(letter.text).toContain("hello");
  });

  it("returns attachments with their filename and bytes", async () => {
    const letter = await parseMailboxEml(readFixture("nested-mixed-base64.eml"));
    expect(letter.attachments?.map((a) => a.filename)).toEqual(["a.bin"]);
    expect(letter.attachments?.[0].content.byteLength).toBeGreaterThan(0);
  });

  it("reads sentAt from the Date header, null when missing", async () => {
    const raw =
      "From: A <a@b.com>\r\nTo: c@d.com\r\nMessage-ID: <x@b.com>\r\nDate: Tue, 01 Jul 2025 10:00:00 +0000\r\n" +
      "Subject: hi\r\nContent-Type: text/plain\r\n\r\nhello\r\n";
    expect((await parseMailboxEml(raw)).sentAt).toBe(Date.parse("Tue, 01 Jul 2025 10:00:00 +0000"));
    expect((await parseMailboxEml(raw.replace(/Date: .*\r\n/, ""))).sentAt).toBeNull();
  });

  it("leaves sentAt and attachments off the JSON path", async () => {
    const letter = await parseMailboxInbound(readFixture("reply-simple.json"));
    expect(letter.sentAt).toBeUndefined();
    expect(letter.attachments).toBeUndefined();
  });
});

describe("ingestInboundLetter storage", () => {
  let plain: Awaited<ReturnType<typeof parseMailboxInbound>>;
  beforeAll(async () => {
    plain = { ...(await parseMailboxInbound(readFixture("reply-simple.json"))), inReplyTo: null, rfcReferences: null };
  });
  const attachment = {
    publicId: "att_1",
    position: 0,
    filename: "a.bin",
    contentType: "application/octet-stream",
    sizeBytes: 3,
    contentId: null,
    storageKey: "mailbox/7/att_1",
  };

  function storeDb(opts: { conflict?: boolean; existingRawKey?: string | null } = {}) {
    const writes: { table: unknown; values: unknown }[] = [];
    let transactions = 0;
    const insert = (table: unknown) => ({
      values: (v: unknown) => {
        writes.push({ table, values: v });
        const attachmentWrite = Promise.resolve([]);
        return Object.assign(attachmentWrite, {
          onConflictDoNothing: () => ({
            returning: async () => (opts.conflict ? [] : [{ id: 7n, publicId: "mbx_1" }]),
          }),
        });
      },
    });
    const select = () => ({
      from: () => ({
        where: () => ({
          limit: async () => (opts.conflict ? [{ rawKey: opts.existingRawKey ?? null }] : []),
        }),
      }),
    });
    const tx = { insert, select };
    const db = {
      ...tx,
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
        transactions++;
        return fn(tx);
      },
    };
    return { db, writes, transactions: () => transactions };
  }

  it("writes the letter and its attachments in one transaction", async () => {
    const { db, writes, transactions } = storeDb();
    const result = await ingestInboundLetter(db as never, tables, plain, {
      recipientTenantId: 9n,
      rawKey: "raw/1.eml",
      authResults: "spf=pass",
      receivedAt: 1000,
      attachments: [attachment],
    });
    expect(result).toEqual({ status: "inserted", id: 7n, publicId: "mbx_1" });
    expect(transactions()).toBe(1);
    expect(writes[0].table).toBe(tables.emailMailbox);
    expect(writes[0].values).toMatchObject({ rawKey: "raw/1.eml", authResults: "spf=pass", createdAt: 1000 });
    expect(writes[1].table).toBe(tables.emailAttachment);
    expect(writes[1].values).toEqual([{ ...attachment, mailboxId: 7n }]);
  });

  it("does not open a transaction without attachments", async () => {
    const { db, transactions } = storeDb();
    await ingestInboundLetter(db as never, tables, plain, { recipientTenantId: null });
    expect(transactions()).toBe(0);
  });

  it("returns the existing raw key on a duplicate and writes no attachments", async () => {
    const { db, writes } = storeDb({ conflict: true, existingRawKey: "raw/old.eml" });
    const result = await ingestInboundLetter(db as never, tables, plain, {
      recipientTenantId: null,
      attachments: [attachment],
    });
    expect(result).toEqual({ status: "duplicate", existingRawKey: "raw/old.eml" });
    expect(writes.map((w) => w.table)).toEqual([tables.emailMailbox]);
  });

  it("stores sentAt from the parsed letter", async () => {
    const { db, writes } = storeDb();
    await ingestInboundLetter(db as never, tables, { ...plain, sentAt: 555 }, { recipientTenantId: null });
    expect(writes[0].values).toMatchObject({ sentAt: 555 });
  });
});
