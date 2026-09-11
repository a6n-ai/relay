import {
  MetaGraphError,
  type CloudSendResult,
  type MetaGraphConfig,
  type SendTemplateParams,
  type SendTextParams,
  type WabaMessageTemplate,
  type WabaPhoneNumber,
} from "./types";

const DEFAULT_API_VERSION = "v22.0";

/**
 * Thin WhatsApp Business Platform Graph client.
 *
 * Foundry-clean: Cloud API (messages) + Business Management API (assets).
 * No tenant IDs, mailbox, or Embedded Signup — callers own product wiring.
 */
export class MetaWhatsAppClient {
  private readonly accessToken: string;
  private readonly apiVersion: string;
  private readonly defaultPhoneNumberId: string | undefined;
  private readonly wabaId: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: MetaGraphConfig) {
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    this.defaultPhoneNumberId = config.phoneNumberId;
    this.wabaId = config.wabaId;
    this.fetchImpl = config.fetch ?? fetch;
  }

  resolvePhoneNumberId(override?: string): string {
    const id = override ?? this.defaultPhoneNumberId;
    if (!id) throw new Error("WhatsApp Cloud API requires a phone_number_id");
    return id;
  }

  async sendText(params: SendTextParams): Promise<CloudSendResult> {
    return this.sendMessage(params.phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeWaTo(params.to),
      type: "text",
      text: { preview_url: params.previewUrl ?? false, body: params.body },
    });
  }

  async sendTemplate(params: SendTemplateParams): Promise<CloudSendResult> {
    const template: Record<string, unknown> = {
      name: params.name,
      language: { code: params.languageCode ?? "en_US" },
    };
    if (params.bodyParameters && params.bodyParameters.length > 0) {
      template.components = [
        {
          type: "body",
          parameters: params.bodyParameters,
        },
      ];
    }
    return this.sendMessage(params.phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeWaTo(params.to),
      type: "template",
      template,
    });
  }

  /** Business Management API: list phone numbers on a WABA. */
  async listPhoneNumbers(wabaId = this.wabaId): Promise<WabaPhoneNumber[]> {
    if (!wabaId) throw new Error("listPhoneNumbers requires a WABA id");
    const json = await this.graphGet<{
      data?: Array<{
        id: string;
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
        code_verification_status?: string;
      }>;
    }>(`/${wabaId}/phone_numbers`);
    return (json.data ?? []).map((row) => ({
      id: row.id,
      displayPhoneNumber: row.display_phone_number ?? "",
      verifiedName: row.verified_name,
      qualityRating: row.quality_rating,
      codeVerificationStatus: row.code_verification_status,
    }));
  }

  /** Business Management API: list message templates on a WABA. */
  async listMessageTemplates(wabaId = this.wabaId): Promise<WabaMessageTemplate[]> {
    if (!wabaId) throw new Error("listMessageTemplates requires a WABA id");
    const json = await this.graphGet<{
      data?: Array<{
        id: string;
        name: string;
        language: string;
        status: string;
        category: string;
      }>;
    }>(`/${wabaId}/message_templates`);
    return (json.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      language: row.language,
      status: row.status,
      category: row.category,
    }));
  }

  /** Business Management API: subscribe this Meta app to WABA webhooks. */
  async subscribeApp(wabaId = this.wabaId): Promise<void> {
    if (!wabaId) throw new Error("subscribeApp requires a WABA id");
    await this.graphPost(`/${wabaId}/subscribed_apps`, {});
  }

  private async sendMessage(
    phoneNumberId: string,
    body: Record<string, unknown>,
  ): Promise<CloudSendResult> {
    const json = await this.graphPost<{
      messages?: Array<{ id: string }>;
      contacts?: Array<{ input: string; wa_id: string }>;
    }>(`/${phoneNumberId}/messages`, body);
    const messageId = json.messages?.[0]?.id;
    if (!messageId) {
      throw new MetaGraphError("Cloud API response missing messages[0].id", 200, JSON.stringify(json));
    }
    return { messageId, contacts: json.contacts };
  }

  private async graphGet<T>(path: string): Promise<T> {
    const url = `https://graph.facebook.com/${this.apiVersion}${path}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    return this.parseJson<T>(res);
  }

  private async graphPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `https://graph.facebook.com/${this.apiVersion}${path}`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return this.parseJson<T>(res);
  }

  private async parseJson<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw new MetaGraphError(
        `WhatsApp Graph request failed (${res.status}): ${text.slice(0, 300)}`,
        res.status,
        text,
      );
    }
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }
}

/** Strip whatsapp: prefix and leading + for Cloud API `to` field. */
export function normalizeWaTo(phone: string): string {
  const trimmed = phone.trim().replace(/^whatsapp:/i, "");
  return trimmed.replace(/^\+/, "");
}
