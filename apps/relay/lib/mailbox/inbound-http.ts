import {
  MailboxInboundError,
  assertInboundSize,
  inboundSnsDecision,
  parseMailboxInbound,
  type ParsedInboundLetter,
} from "@relay/engine";
import { verifyWebhookSignature } from "@/lib/webhooks/sign";

export type InboundHttpResult = { status: number; body?: { ok?: boolean; duplicate?: boolean; title?: string } };

export async function handleMailboxInboundPost(input: {
  raw: string;
  /** Envelope from Cloudflare Email Routing. When present the signature covers it, and it decides the recipient. */
  envelope?: { to: string; from: string } | null;
  signature: string | null;
  secret: string | undefined;
  ingest: (letter: ParsedInboundLetter) => Promise<"inserted" | "duplicate">;
}): Promise<InboundHttpResult> {
  if (!input.secret) {
    return { status: 503, body: { title: "Inbound mailbox is not configured" } };
  }
  try {
    assertInboundSize(input.raw);
  } catch (err) {
    if (err instanceof MailboxInboundError) {
      return { status: err.status, body: { title: err.message } };
    }
    throw err;
  }
  const signed = input.envelope ? `${input.envelope.to}\n${input.envelope.from}\n${input.raw}` : input.raw;
  if (!input.signature || !verifyWebhookSignature(input.secret, signed, input.signature)) {
    return { status: 401, body: { title: "Invalid signature" } };
  }
  let payload = input.raw;
  const sns = inboundSnsDecision(input.raw);
  switch (sns.kind) {
    case "subscription":
    case "ignore":
      return { status: 200, body: { ok: true } };
    case "notification":
      payload = sns.message;
      break;
    case "direct":
      break;
    default: {
      const _exhaustive: never = sns;
      return _exhaustive;
    }
  }
  try {
    const parsed = parseMailboxInbound(payload);
    const letter = input.envelope ? { ...parsed, toEmail: input.envelope.to.trim().toLowerCase() } : parsed;
    const result = await input.ingest(letter);
    return { status: 200, body: { ok: true, duplicate: result === "duplicate" } };
  } catch (err) {
    if (err instanceof MailboxInboundError) {
      return { status: err.status, body: { title: err.message } };
    }
    throw err;
  }
}
