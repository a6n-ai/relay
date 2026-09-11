import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta webhook GET challenge (hub.mode / hub.verify_token / hub.challenge).
 * Returns the challenge string when verification succeeds; otherwise null.
 */
export function verifyWhatsAppWebhookChallenge(
  query: {
    "hub.mode"?: string | null;
    "hub.verify_token"?: string | null;
    "hub.challenge"?: string | null;
  },
  expectedVerifyToken: string,
): string | null {
  if (query["hub.mode"] !== "subscribe") return null;
  if (!expectedVerifyToken || query["hub.verify_token"] !== expectedVerifyToken) return null;
  const challenge = query["hub.challenge"];
  return typeof challenge === "string" && challenge.length > 0 ? challenge : null;
}

/**
 * Validate `X-Hub-Signature-256` for a raw POST body using the Meta app secret.
 * Docs: sha256=<hex hmac of body>.
 */
export function verifyWhatsAppWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const theirHex = signatureHeader.slice(prefix.length);
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(theirHex, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
