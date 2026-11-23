import { z } from "zod";

export const SES_EVENT_TYPES = [
  "Send",
  "Delivery",
  "Bounce",
  "Complaint",
  "Reject",
  "DeliveryDelay",
  "RenderingFailure",
  "Open",
  "Click",
] as const;
export type SesEventType = (typeof SES_EVENT_TYPES)[number];

export type SesEventJob = {
  workspaceId: string;
  messageId: string;
  sesMessageId: string;
  snsMessageId: string;
  type: SesEventType;
  occurredAt: number;
  recipients: string[];
  bounceType?: string;
  link?: string;
};

const eventType = z.enum(SES_EVENT_TYPES);
const when = z.string().optional();
const addresses = z.array(z.object({ emailAddress: z.string() }));

const sesEventSchema = z.object({
  eventType: eventType.optional(),
  notificationType: eventType.optional(),
  mail: z.object({
    messageId: z.string(),
    timestamp: when,
    destination: z.array(z.string()).optional(),
    tags: z.record(z.string(), z.array(z.string())).optional(),
  }),
  bounce: z
    .object({ timestamp: when, bounceType: z.string().optional(), bouncedRecipients: addresses.optional() })
    .optional(),
  complaint: z.object({ timestamp: when, complainedRecipients: addresses.optional() }).optional(),
  delivery: z.object({ timestamp: when, recipients: z.array(z.string()).optional() }).optional(),
  open: z.object({ timestamp: when }).optional(),
  click: z.object({ timestamp: when, link: z.string().optional() }).optional(),
});

// Returns null for anything the feed does not route: no tags, an unknown or non-event type, or bad JSON.
export function sesEventJobFrom(snsMessageId: string, messageJson: string): SesEventJob | null {
  let raw: unknown;
  try {
    raw = JSON.parse(messageJson);
  } catch {
    return null;
  }
  const parsed = sesEventSchema.safeParse(raw);
  if (!parsed.success) return null;
  const event = parsed.data;
  const type = event.eventType ?? event.notificationType;
  const workspaceId = event.mail.tags?.ws?.[0];
  const messageId = event.mail.tags?.msg?.[0];
  if (!type || !workspaceId || !messageId) return null;

  const own: Partial<Record<SesEventType, { timestamp?: string }>> = {
    Bounce: event.bounce,
    Complaint: event.complaint,
    Delivery: event.delivery,
    Open: event.open,
    Click: event.click,
  };
  const occurredAt = Date.parse(own[type]?.timestamp ?? event.mail.timestamp ?? "");
  if (!Number.isFinite(occurredAt)) return null;

  const listed =
    type === "Bounce"
      ? event.bounce?.bouncedRecipients?.map((r) => r.emailAddress)
      : type === "Complaint"
        ? event.complaint?.complainedRecipients?.map((r) => r.emailAddress)
        : type === "Delivery"
          ? event.delivery?.recipients
          : undefined;
  const recipients = (listed?.length ? listed : (event.mail.destination ?? [])).map((a) => a.toLowerCase());

  return {
    workspaceId,
    messageId,
    sesMessageId: event.mail.messageId,
    snsMessageId,
    type,
    occurredAt,
    recipients,
    bounceType: event.bounce?.bounceType,
    link: event.click?.link,
  };
}
