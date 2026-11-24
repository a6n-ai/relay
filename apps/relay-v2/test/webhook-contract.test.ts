import { env } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mailboxReceivedJson, webhookBody, webhookHeaders } from "../src/core/mailbox-received";
import { decryptSecret, encryptSecret, newWebhookSecret, signBody } from "../src/core/webhook-crypto";

const json = mailboxReceivedJson({
  messageId: "msg_000000000001",
  envelopeTo: "info@tiffingrab.ca",
  envelopeFrom: "bounce@out.test",
  from: "cust@example.com",
  fromName: "Cust",
  to: "info@tiffingrab.ca",
  subject: "Invoice",
  text: "Hello",
  html: "",
  receivedAt: 1794999999000,
  authResults: "dmarc=pass",
});
const body = webhookBody("whd_000000000001", "mailbox.received", 1795000000000, json);

describe("mailbox.received contract", () => {
  it("serializes the frozen body in key order", () => {
    expect(body).toBe(
      '{"id":"whd_000000000001","type":"mailbox.received","createdAt":1795000000000,"data":{"to":"info@tiffingrab.ca","from":"cust@example.com","html":"","text":"Hello","subject":"Invoice","fromName":"Cust","messageId":"msg_000000000001","envelopeTo":"info@tiffingrab.ca","receivedAt":1794999999000,"authResults":"dmarc=pass","envelopeFrom":"bounce@out.test"}}',
    );
  });

  it("signs the body with the pinned HMAC and matches node:crypto", async () => {
    const secret = "test-webhook-secret-0123456789abcdef";
    const sig = await signBody(secret, body);
    expect(sig).toBe("97fd3750ecf6fe40cc892a337bdddf5f9df9bcd84719fb049f2454f1d7c3686b");
    expect(sig).toBe(createHmac("sha256", secret).update(body).digest("hex"));
  });

  it("builds the signature header from the signature hex", () => {
    expect(webhookHeaders("mailbox.received", "abc")["x-relay-signature"]).toBe("sha256=abc");
  });

  it("serializes null fromName and authResults as null and round-trips escaped text", () => {
    const text = 'say "hi"\nthe café';
    const parsed = JSON.parse(
      mailboxReceivedJson({
        messageId: "msg_1",
        envelopeTo: "a@b.ca",
        envelopeFrom: "",
        from: "x@y.ca",
        fromName: null,
        to: "a@b.ca",
        subject: "",
        text,
        html: "",
        receivedAt: 1,
        authResults: null,
      }),
    );
    expect(parsed.fromName).toBeNull();
    expect(parsed.authResults).toBeNull();
    expect(parsed.text).toBe(text);
  });

  it("rejects an unsafe createdAt", () => {
    expect(() => webhookBody("whd_1", "mailbox.received", 1.5, json)).toThrow();
  });

  it("rejects a data field that is undefined instead of dropping it", () => {
    const input = {
      messageId: "msg_1",
      envelopeTo: "a@b.ca",
      envelopeFrom: "",
      from: "x@y.ca",
      fromName: undefined,
      to: "a@b.ca",
      subject: "",
      text: "",
      html: "",
      receivedAt: 1,
      authResults: null,
    };
    expect(() => mailboxReceivedJson(input as never)).toThrow("mailbox.received field missing");
  });

  it("rejects a receivedAt that is not a safe integer", () => {
    const input = {
      messageId: "msg_1",
      envelopeTo: "a@b.ca",
      envelopeFrom: "",
      from: "x@y.ca",
      fromName: null,
      to: "a@b.ca",
      subject: "",
      text: "",
      html: "",
      receivedAt: Number.NaN,
      authResults: null,
    };
    expect(() => mailboxReceivedJson(input)).toThrow("receivedAt not a safe integer");
  });

  it("generates a 32-byte lowercase hex secret", () => {
    expect(newWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("webhook secret encryption", () => {
  const key = env.WEBHOOK_SECRET_KEY;

  it("round-trips a secret and uses a fresh IV each time", async () => {
    const a = await encryptSecret(key, "s3cret", "wsp_a:whk_1");
    const b = await encryptSecret(key, "s3cret", "wsp_a:whk_1");
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toBe(b);
    expect(await decryptSecret(key, a, "wsp_a:whk_1")).toBe("s3cret");
  });

  it("refuses to decrypt under a different AAD", async () => {
    const stored = await encryptSecret(key, "s3cret", "wsp_a:whk_1");
    await expect(decryptSecret(key, stored, "wsp_b:whk_1")).rejects.toThrow();
  });

  it("refuses to decrypt under a different key", async () => {
    const stored = await encryptSecret(key, "s3cret", "wsp_a:whk_1");
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    await expect(decryptSecret(other, stored, "wsp_a:whk_1")).rejects.toThrow();
  });

  it("throws a fixed error when the key is missing", async () => {
    await expect(encryptSecret(undefined, "s3cret", "wsp_a:whk_1")).rejects.toThrow(
      "webhook key not configured",
    );
    await expect(decryptSecret(undefined, "v1:a:b", "wsp_a:whk_1")).rejects.toThrow(
      "webhook key not configured",
    );
    await expect(encryptSecret(btoa("too-short"), "s3cret", "wsp_a:whk_1")).rejects.toThrow(
      "webhook key not configured",
    );
  });
});
