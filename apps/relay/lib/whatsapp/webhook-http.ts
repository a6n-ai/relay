import {
  parseWhatsAppWebhook,
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
  type WhatsAppWebhookEvent,
} from "@relay/whatsapp";

export type WhatsAppWebhookHttpResult =
  | { kind: "challenge"; challenge: string }
  | { kind: "ok"; eventCount: number }
  | { kind: "error"; status: number; title: string };

export async function handleWhatsAppWebhookGet(input: {
  searchParams: URLSearchParams;
  verifyToken: string | undefined;
}): Promise<WhatsAppWebhookHttpResult> {
  if (!input.verifyToken) {
    return { kind: "error", status: 503, title: "WhatsApp webhook is not configured" };
  }
  const challenge = verifyWhatsAppWebhookChallenge(
    {
      "hub.mode": input.searchParams.get("hub.mode"),
      "hub.verify_token": input.searchParams.get("hub.verify_token"),
      "hub.challenge": input.searchParams.get("hub.challenge"),
    },
    input.verifyToken,
  );
  if (!challenge) {
    return { kind: "error", status: 403, title: "Invalid verify token" };
  }
  return { kind: "challenge", challenge };
}

export async function handleWhatsAppWebhookPost(input: {
  raw: string;
  signature: string | null;
  appSecret: string | undefined;
  onEvents: (events: WhatsAppWebhookEvent[]) => Promise<void>;
}): Promise<WhatsAppWebhookHttpResult> {
  if (!input.appSecret) {
    return { kind: "error", status: 503, title: "WhatsApp webhook is not configured" };
  }
  if (!verifyWhatsAppWebhookSignature(input.raw, input.signature, input.appSecret)) {
    return { kind: "error", status: 401, title: "Invalid signature" };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.raw) as unknown;
  } catch {
    return { kind: "error", status: 400, title: "Invalid JSON" };
  }

  const { events } = parseWhatsAppWebhook(parsedJson);
  await input.onEvents(events);
  return { kind: "ok", eventCount: events.length };
}

export type {
  WhatsAppInboundMessage,
  WhatsAppAccountUpdate,
  WhatsAppStatusUpdate,
  WhatsAppWebhookEvent,
} from "@relay/whatsapp";
