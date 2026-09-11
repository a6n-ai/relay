import { TwilioSmsProvider } from "@relay/sms";
import { createWhatsAppProviderFromEnv } from "@relay/whatsapp";
import type { ChannelProvider } from "@relay/engine";

export function smsProviderFromEnv(): ChannelProvider | undefined {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  if (!accountSid || !authToken || !from) return undefined;
  return new TwilioSmsProvider({
    accountSid,
    authToken,
    from,
    statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL,
  });
}

/** Meta Cloud API when WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID; else Twilio. */
export function whatsappProviderFromEnv(): ChannelProvider | undefined {
  return createWhatsAppProviderFromEnv(process.env);
}
