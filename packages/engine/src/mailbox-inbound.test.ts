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
  it("parses a simple JSON reply with angle-bracket ids", () => {
    const letter = parseMailboxInbound(readFixture("reply-simple.json"));
    expect(letter.fromEmail).toBe("cust@example.com");
    expect(letter.toEmail).toBe("ops@relay.local");
    expect(letter.text).toContain("Thanks");
    expect(letter.inReplyTo).toBe("<abc@relay.test>");
    expect(letter.rfcMessageId).toBe("<reply-1@example.com>");
  });

  it("stores HTML as a plain string (no DOM)", () => {
    const letter = parseMailboxInbound(readFixture("reply-html-text.json"));
    expect(typeof letter.html).toBe("string");
    expect(letter.html).toBe("<p>Thanks</p>");
    expect(letter.text).toBe("Thanks");
  });

  it("allows text-only letters", () => {
    const letter = parseMailboxInbound(readFixture("missing-html.json"));
    expect(letter.html).toBe("");
    expect(letter.text).toBe("Plain only");
  });

  it("decodes an encoded Subject on .eml", () => {
    const letter = parseMailboxInbound(readFixture("encoded-subject.eml"));
    expect(letter.subject).toBe("Re: Order ready");
    expect(letter.fromName).toBe("Customer");
  });

  it("keeps Message-IDs from the angle-ids fixture", () => {
    const letter = parseMailboxInbound(readFixture("angle-ids.json"));
    expect(letter.rfcMessageId).toBe("reply-bare@example.com");
    expect(letter.rfcReferences).toContain("<root@relay.test>");
  });

  it("throws a typed error when over the size cap", () => {
    const raw = `{${"x".repeat(MAX_MAILBOX_INBOUND_BYTES)}}`;
    try {
      parseMailboxInbound(raw);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MailboxInboundError);
      expect((err as MailboxInboundError).code).toBe("too_large");
      expect((err as MailboxInboundError).status).toBe(413);
    }
  });

  it("rejects missing From/To and empty body", () => {
    expect(() => parseMailboxInbound(JSON.stringify({ to: "a@b.com", subject: "x", text: "y", rfcMessageId: "<1@x>" }))).toThrow(
      MailboxInboundError,
    );
    expect(() =>
      parseMailboxInbound(JSON.stringify({ from: "a@b.com", to: "b@c.com", subject: "x", rfcMessageId: "<1@x>" })),
    ).toThrow(MailboxInboundError);
  });
});

describe("inboundSnsDecision", () => {
  it("does not treat SubscribeURL as something to fetch", () => {
    const raw = JSON.stringify({
      Type: "SubscriptionConfirmation",
      Message: "confirm",
      SubscribeURL: "https://example.invalid/confirm",
    });
    expect(inboundSnsDecision(raw)).toEqual({ kind: "subscription" });
  });

  it("unwraps Notification and ignores other types", () => {
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
    const parsed = parseMailboxInbound(readFixture("reply-simple.json"));
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
    const parsed = parseMailboxInbound(readFixture("reply-simple.json"));
    await ingestInboundLetter(db as never, tables, parsed);
    expect(inserted[0]).toMatchObject({
      threadId: "<reply-1@example.com>",
      tenantId: null,
    });
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
    const parsed = parseMailboxInbound(readFixture("reply-simple.json"));
    expect(await ingestInboundLetter(db as never, tables, parsed)).toBe("duplicate");
  });
});
