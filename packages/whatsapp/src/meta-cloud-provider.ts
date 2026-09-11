import type { ChannelProvider, OutboundMessage } from "@relay/engine";
import { MetaWhatsAppClient } from "./meta/graph-client";
import type { MetaGraphConfig } from "./meta/types";

export interface MetaCloudWhatsAppConfig extends MetaGraphConfig {
  /** Required for ChannelProvider sends when message does not override. */
  phoneNumberId: string;
}

/**
 * Meta Cloud API ChannelProvider.
 *
 * - `providerTemplateId` = Meta template **name** (not Twilio Content SID).
 * - `vars.language` (or `vars._language`) → template language code (default en_US).
 * - Remaining string/number vars → positional body parameters in key sort order.
 * - Free-form `text` only valid inside Meta's 24h customer service window.
 */
export class MetaCloudWhatsAppProvider implements ChannelProvider {
  private readonly client: MetaWhatsAppClient;
  private readonly phoneNumberId: string;

  constructor(config: MetaCloudWhatsAppConfig) {
    this.phoneNumberId = config.phoneNumberId;
    this.client = new MetaWhatsAppClient(config);
  }

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const to = message.to.phone;
    if (!to) throw new Error("WhatsApp requires a phone number");

    const phoneNumberId = this.phoneNumberId;

    if (message.providerTemplateId) {
      const { languageCode, bodyParameters } = templatePartsFromVars(message.vars);
      const result = await this.client.sendTemplate({
        phoneNumberId,
        to,
        name: message.providerTemplateId,
        languageCode,
        bodyParameters,
      });
      return { providerMessageId: result.messageId };
    }

    if (message.text) {
      const result = await this.client.sendText({
        phoneNumberId,
        to,
        body: message.text,
      });
      return { providerMessageId: result.messageId };
    }

    throw new Error("WhatsApp requires either a template id or a text body");
  }
}

const LANGUAGE_KEYS = new Set(["language", "_language", "language_code", "_language_code"]);

function templatePartsFromVars(vars: Record<string, unknown> | undefined): {
  languageCode: string;
  bodyParameters: Array<{ type: "text"; text: string; parameter_name?: string }>;
} {
  if (!vars) return { languageCode: "en_US", bodyParameters: [] };

  let languageCode = "en_US";
  const bodyParameters: Array<{ type: "text"; text: string; parameter_name?: string }> = [];

  for (const key of Object.keys(vars).sort()) {
    const value = vars[key];
    if (LANGUAGE_KEYS.has(key)) {
      if (typeof value === "string" && value.trim()) languageCode = value.trim();
      continue;
    }
    if (value === undefined || value === null) continue;
    const text = typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value);
    // Named params when key is not a pure digit (Meta named-parameter templates).
    if (/^\d+$/.test(key)) {
      bodyParameters.push({ type: "text", text });
    } else {
      bodyParameters.push({ type: "text", text, parameter_name: key });
    }
  }

  return { languageCode, bodyParameters };
}
