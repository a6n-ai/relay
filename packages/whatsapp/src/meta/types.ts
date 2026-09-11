/** Minimal Cloud API / Business Management API shapes used by Relay. */

export type WhatsAppEnv = Record<string, string | undefined>;

export interface MetaGraphConfig {
  accessToken: string;
  /** Graph API version pin, e.g. `v22.0`. */
  apiVersion?: string;
  /** Default business phone number id for sends (Cloud API path). */
  phoneNumberId?: string;
  /** Optional WABA id for Business Management API helpers. */
  wabaId?: string;
  fetch?: typeof fetch;
}

export interface SendTextParams {
  phoneNumberId: string;
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface SendTemplateParams {
  phoneNumberId: string;
  to: string;
  /** Meta template name (not a Twilio Content SID). */
  name: string;
  languageCode?: string;
  /** Named or positional body parameters. */
  bodyParameters?: Array<{ type: "text"; text: string; parameter_name?: string }>;
}

export interface CloudSendResult {
  messageId: string;
  contacts?: Array<{ input: string; wa_id: string }>;
}

export interface WabaPhoneNumber {
  id: string;
  displayPhoneNumber: string;
  verifiedName?: string;
  qualityRating?: string;
  codeVerificationStatus?: string;
}

export interface WabaMessageTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
}

export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
}
