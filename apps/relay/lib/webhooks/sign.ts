import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function newWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function signWebhookBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  const expected = Buffer.from(signWebhookBody(secret, body), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  } catch {
    return false;
  }
  return expected.length === given.length && timingSafeEqual(expected, given);
}
