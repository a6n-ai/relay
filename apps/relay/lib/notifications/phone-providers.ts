import { TwilioSmsProvider } from "@relay/sms";
import { TwilioWhatsAppProvider } from "@relay/whatsapp";
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

export function whatsappProviderFromEnv(): ChannelProvider | undefined {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) return undefined;
  return new TwilioWhatsAppProvider({
    accountSid,
    authToken,
    from,
    statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL,
  });
}
