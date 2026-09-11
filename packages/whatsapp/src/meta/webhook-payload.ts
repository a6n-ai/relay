/** Parsed WhatsApp Business Platform webhook events (Cloud API). */

export type WhatsAppWebhookStatusValue = "sent" | "delivered" | "read" | "failed" | "played" | string;

export interface WhatsAppWebhookMetadata {
  phoneNumberId: string;
  displayPhoneNumber: string;
}

export interface WhatsAppInboundMessage {
  kind: "inbound_message";
  wabaId: string;
  metadata: WhatsAppWebhookMetadata;
  messageId: string;
  from: string;
  timestampMs: number;
  type: string;
  textBody?: string;
  contactName?: string;
}

export interface WhatsAppStatusUpdate {
  kind: "status";
  wabaId: string;
  metadata: WhatsAppWebhookMetadata;
  messageId: string;
  status: WhatsAppWebhookStatusValue;
  timestampMs: number;
  recipientId?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export interface WhatsAppAccountUpdate {
  kind: "account_update";
  wabaId: string;
  event?: string;
  rawValue: Record<string, unknown>;
}

export type WhatsAppWebhookEvent =
  | WhatsAppInboundMessage
  | WhatsAppStatusUpdate
  | WhatsAppAccountUpdate;

export interface ParseWhatsAppWebhookResult {
  object: string | null;
  events: WhatsAppWebhookEvent[];
}

/**
 * Flatten a Meta WhatsApp webhook body into typed events.
 * Unknown / empty payloads return `{ events: [] }` rather than throw.
 */
export function parseWhatsAppWebhook(raw: unknown): ParseWhatsAppWebhookResult {
  if (!raw || typeof raw !== "object") return { object: null, events: [] };
  const root = raw as {
    object?: unknown;
    entry?: unknown;
  };
  const object = typeof root.object === "string" ? root.object : null;
  if (!Array.isArray(root.entry)) return { object, events: [] };

  const events: WhatsAppWebhookEvent[] = [];

  for (const entry of root.entry) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { id?: unknown; changes?: unknown };
    const wabaId = typeof e.id === "string" ? e.id : "";
    if (!Array.isArray(e.changes)) continue;

    for (const change of e.changes) {
      if (!change || typeof change !== "object") continue;
      const c = change as { field?: unknown; value?: unknown };
      const field = typeof c.field === "string" ? c.field : "";
      const value = c.value && typeof c.value === "object" ? (c.value as Record<string, unknown>) : null;
      if (!value) continue;

      if (field === "account_update") {
        events.push({
          kind: "account_update",
          wabaId,
          event: typeof value.event === "string" ? value.event : undefined,
          rawValue: value,
        });
        continue;
      }

      if (field !== "messages") continue;

      const metadata = parseMetadata(value.metadata);
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const contactName = firstContactName(contacts);

      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          if (!msg || typeof msg !== "object") continue;
          const m = msg as Record<string, unknown>;
          const messageId = typeof m.id === "string" ? m.id : "";
          const from = typeof m.from === "string" ? m.from : "";
          if (!messageId || !from) continue;
          const text = m.text && typeof m.text === "object" ? (m.text as { body?: unknown }).body : undefined;
          events.push({
            kind: "inbound_message",
            wabaId,
            metadata,
            messageId,
            from,
            timestampMs: epochSecondsToMs(m.timestamp),
            type: typeof m.type === "string" ? m.type : "unknown",
            textBody: typeof text === "string" ? text : undefined,
            contactName,
          });
        }
      }

      if (Array.isArray(value.statuses)) {
        for (const st of value.statuses) {
          if (!st || typeof st !== "object") continue;
          const s = st as Record<string, unknown>;
          const messageId = typeof s.id === "string" ? s.id : "";
          if (!messageId) continue;
          const errors = Array.isArray(s.errors)
            ? s.errors.filter((err): err is Record<string, unknown> => !!err && typeof err === "object")
            : undefined;
          events.push({
            kind: "status",
            wabaId,
            metadata,
            messageId,
            status: typeof s.status === "string" ? s.status : "unknown",
            timestampMs: epochSecondsToMs(s.timestamp),
            recipientId: typeof s.recipient_id === "string" ? s.recipient_id : undefined,
            errors: errors?.map((err) => ({
              code: typeof err.code === "number" ? err.code : undefined,
              title: typeof err.title === "string" ? err.title : undefined,
              message: typeof err.message === "string" ? err.message : undefined,
            })),
          });
        }
      }
    }
  }

  return { object, events };
}

function parseMetadata(raw: unknown): WhatsAppWebhookMetadata {
  if (!raw || typeof raw !== "object") {
    return { phoneNumberId: "", displayPhoneNumber: "" };
  }
  const m = raw as Record<string, unknown>;
  return {
    phoneNumberId: typeof m.phone_number_id === "string" ? m.phone_number_id : "",
    displayPhoneNumber: typeof m.display_phone_number === "string" ? m.display_phone_number : "",
  };
}

function firstContactName(contacts: unknown[]): string | undefined {
  for (const c of contacts) {
    if (!c || typeof c !== "object") continue;
    const profile = (c as { profile?: unknown }).profile;
    if (profile && typeof profile === "object") {
      const name = (profile as { name?: unknown }).name;
      if (typeof name === "string" && name) return name;
    }
  }
  return undefined;
}

function epochSecondsToMs(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw * 1000;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw) * 1000;
  return Date.now();
}
