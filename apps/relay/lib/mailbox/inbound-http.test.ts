import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { MAX_MAILBOX_INBOUND_BYTES } from "@relay/engine";
import { signWebhookBody } from "@/lib/webhooks/sign";
import { handleMailboxInboundPost } from "./inbound-http";

const secret = "inbound-test-secret";
const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/engine/src/mailbox/fixtures/reply-simple.json"),
  "utf8",
);

describe("handleMailboxInboundPost", () => {
  it("rejects a missing or wrong signature", async () => {
    const ingest = vi.fn();
    expect(await handleMailboxInboundPost({ raw: fixture, signature: null, secret, ingest })).toMatchObject({
      status: 401,
    });
    expect(
      await handleMailboxInboundPost({ raw: fixture, signature: signWebhookBody(secret, fixture + "x"), secret, ingest }),
    ).toMatchObject({ status: 401 });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("accepts a signed fixture", async () => {
    const ingest = vi.fn().mockResolvedValue("inserted");
    const sig = signWebhookBody(secret, fixture);
    const res = await handleMailboxInboundPost({ raw: fixture, signature: sig, secret, ingest });
    expect(res.status).toBe(200);
    expect(ingest).toHaveBeenCalledOnce();
    expect(ingest.mock.calls[0][0].fromEmail).toBe("cust@example.com");
  });

  it("returns 413 for an oversized body without ingesting", async () => {
    const ingest = vi.fn();
    const raw = "x".repeat(MAX_MAILBOX_INBOUND_BYTES + 1);
    const sig = signWebhookBody(secret, raw);
    expect(await handleMailboxInboundPost({ raw, signature: sig, secret, ingest })).toMatchObject({ status: 413 });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("acknowledges SNS subscription without fetching SubscribeURL", async () => {
    const ingest = vi.fn();
    const raw = JSON.stringify({
      Type: "SubscriptionConfirmation",
      Message: "confirm",
      SubscribeURL: "https://example.invalid/confirm",
    });
    const sig = signWebhookBody(secret, raw);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await handleMailboxInboundPost({ raw, signature: sig, secret, ingest });
    expect(res.status).toBe(200);
    expect(ingest).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
