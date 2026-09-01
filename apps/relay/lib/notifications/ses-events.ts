export type SesSuppression = { email: string; reason: string };

type SesEvent = {
  eventType?: string;
  notificationType?: string;
  bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress: string }[] };
  complaint?: { complainedRecipients?: { emailAddress: string }[] };
};

/** Map an SES/SNS payload to suppressions. Transactional-safe: only hard bounce + complaint. */
export function sesSuppressionsFromEvent(event: SesEvent): SesSuppression[] {
  const type = event.eventType ?? event.notificationType;
  if (type === "Bounce" && event.bounce?.bounceType === "Permanent") {
    return (event.bounce.bouncedRecipients ?? []).map((r) => ({
      email: r.emailAddress,
      reason: "SES hard bounce",
    }));
  }
  if (type === "Complaint") {
    return (event.complaint?.complainedRecipients ?? []).map((r) => ({
      email: r.emailAddress,
      reason: "SES complaint",
    }));
  }
  return [];
}

export function parseSnsEnvelope(raw: string): { Type: string; TopicArn?: string; Message: string } | null {
  try {
    const msg = JSON.parse(raw) as { Type?: string; TopicArn?: string; Message?: string };
    if (typeof msg?.Type !== "string" || typeof msg.Message !== "string") return null;
    return { Type: msg.Type, TopicArn: msg.TopicArn, Message: msg.Message };
  } catch {
    return null;
  }
}
