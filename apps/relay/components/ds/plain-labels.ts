import type { Channel } from "@relay/engine";

export function kindLabel(kind: string): string {
  switch (kind) {
    case "transactional":
      return "Receipts & alerts";
    case "marketing":
      return "Marketing";
    default:
      return kind;
  }
}

export function webhookEventLabel(event: string): string {
  switch (event) {
    case "message.queued":
      return "Waiting to send";
    case "message.sent":
      return "Sent";
    case "message.failed":
      return "Didn’t send";
    case "message.bounced":
      return "Bounced back";
    case "message.complained":
      return "Marked as spam";
    default:
      return event;
  }
}

export function consentSourceLabel(source: string): string {
  switch (source) {
    case "purchase":
      return "Customer purchased";
    case "express_optin":
      return "They asked to hear from us";
    case "event_signup":
      return "Signed up at an event";
    case "import_other":
      return "Imported";
    default:
      return source;
  }
}

export function channelPlainLabel(key: Channel): string {
  switch (key) {
    case "email":
      return "Email";
    case "sms":
      return "Text message";
    case "whatsapp":
      return "WhatsApp";
    case "in_app":
      return "In the app";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function displayChannel(key: string): string {
  switch (key) {
    case "email":
    case "sms":
    case "whatsapp":
    case "in_app":
      return channelPlainLabel(key);
    default:
      return key;
  }
}

export function fromSourceLabel(source: string): string {
  switch (source) {
    case "tenant":
      return "this app";
    case "operator":
      return "Relay default";
    default:
      return source;
  }
}

export function campaignStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "scheduled":
      return "Scheduled";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "paused":
      return "Paused";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function outboxStatusLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "processing":
      return "Sending";
    case "pending":
      return "Waiting";
    default:
      return status;
  }
}

export function domainStatusLabel(status: string): string {
  switch (status) {
    case "verified":
      return "Ready";
    case "pending":
      return "Waiting on DNS";
    case "failed":
      return "Couldn’t check";
    default:
      return status;
  }
}
