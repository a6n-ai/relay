export const STREAMS = ["transactional", "tracked", "marketing"] as const;
export type Stream = (typeof STREAMS)[number];

export const MESSAGE_STATUSES = ["queued", "sent", "failed", "suppressed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const SUPPRESSION_REASONS = ["unsubscribe", "bounce", "complaint", "manual"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const MAILBOX_RECEIVED = "mailbox.received";
export const WEBHOOK_EVENTS = [MAILBOX_RECEIVED] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
