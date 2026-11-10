import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bigint, pgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  MAX_MAILBOX_INBOUND_BYTES,
  MailboxInboundError,
  inboundSnsDecision,
  ingestInboundLetter,
  parseMailboxInbound,
} from "./mailbox-inbound";
import { makeTenantNotificationTables } from "./tenant-schema";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "mailbox/fixtures");
const tenants = pgTable("tenants", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const tables = makeTenantNotificationTables({ tenants });

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
    expect(result).toBe("inserted");
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
    expect(await ingestInboundLetter(db as never, tables, parsed)).toBe("duplicate");
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
