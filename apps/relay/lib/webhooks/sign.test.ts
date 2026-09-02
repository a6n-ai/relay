import { describe, expect, it } from "vitest";
import { signWebhookBody, verifyWebhookSignature } from "./sign";

describe("webhook signatures", () => {
  it("round-trips HMAC over the raw body", () => {
    const body = JSON.stringify({ type: "message.sent" });
    const sig = signWebhookBody("s3cret", body);
    expect(verifyWebhookSignature("s3cret", body, sig)).toBe(true);
    expect(verifyWebhookSignature("s3cret", body, `sha256=${sig}`)).toBe(true);
    expect(verifyWebhookSignature("s3cret", body + "x", sig)).toBe(false);
    expect(verifyWebhookSignature("other", body, sig)).toBe(false);
  });
});
