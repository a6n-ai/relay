import type { ChannelProvider } from "@relay/engine";
import { MetaCloudWhatsAppProvider } from "./meta-cloud-provider";
import type { WhatsAppEnv } from "./meta/types";
import { TwilioWhatsAppProvider } from "./twilio-provider";

export type WhatsAppTransportKind = "meta" | "twilio";

/**
 * Prefer Meta Cloud API when token + phone_number_id are set.
 * Explicit `WHATSAPP_PROVIDER=twilio|meta` overrides auto-detect.
 */
export function whatsappTransportKind(env: WhatsAppEnv = process.env): WhatsAppTransportKind | undefined {
  const forced = (env.WHATSAPP_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "meta" || forced === "twilio") return forced;

  if (metaCredsReady(env)) return "meta";
  if (twilioCredsReady(env)) return "twilio";
  return undefined;
}

export function createWhatsAppProviderFromEnv(env: WhatsAppEnv = process.env): ChannelProvider | undefined {
  const kind = whatsappTransportKind(env);
  if (kind === "meta") {
    return new MetaCloudWhatsAppProvider({
      accessToken: env.WHATSAPP_ACCESS_TOKEN ?? env.META_WHATSAPP_ACCESS_TOKEN ?? "",
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? env.META_WHATSAPP_PHONE_NUMBER_ID ?? "",
      wabaId: env.WHATSAPP_WABA_ID ?? env.META_WHATSAPP_WABA_ID,
      apiVersion: env.WHATSAPP_GRAPH_VERSION ?? env.META_WHATSAPP_GRAPH_VERSION,
    });
  }
  if (kind === "twilio") {
    return new TwilioWhatsAppProvider({
      accountSid: env.TWILIO_ACCOUNT_SID ?? "",
      authToken: env.TWILIO_AUTH_TOKEN ?? "",
      from: env.TWILIO_WHATSAPP_FROM ?? "",
      statusCallbackUrl: env.TWILIO_STATUS_CALLBACK_URL,
    });
  }
  return undefined;
}

function metaCredsReady(env: WhatsAppEnv): boolean {
  const token = env.WHATSAPP_ACCESS_TOKEN ?? env.META_WHATSAPP_ACCESS_TOKEN;
  const phone = env.WHATSAPP_PHONE_NUMBER_ID ?? env.META_WHATSAPP_PHONE_NUMBER_ID;
  return Boolean(token && phone);
}

function twilioCredsReady(env: WhatsAppEnv): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM);
}
