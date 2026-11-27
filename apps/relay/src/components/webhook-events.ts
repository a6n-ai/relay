import type { WebhookEvent } from "../core/webhooks";

// Typed against WebhookEvent, so a new server event fails the build here until it has copy.
export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "mailbox.received": "New letter received",
};

export const WEBHOOK_EVENT_LIST = Object.keys(WEBHOOK_EVENT_LABELS) as WebhookEvent[];
