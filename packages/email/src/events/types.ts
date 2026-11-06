export const EMAIL_EVENT_TYPES = [
  "send", "delivery", "delivery_delay", "open", "click",
  "bounce", "complaint", "reject", "rendering_failure", "subscription",
] as const;
export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number];
export type StreamKind = "untracked" | "tracked" | "marketing";

export interface EmailStream {
  id: string;
  label: string;
  configSet: string;
  kind: StreamKind;
}

export interface EmailEventRouting {
  webhook: EmailEventType[];
  /** null = the stream has no counts destination. */
  counts: EmailEventType[] | null;
}

export interface EmailEventSettingsProvider {
  getRouting(stream: EmailStream): Promise<EmailEventRouting>;
  setRouting(stream: EmailStream, routing: { webhook: EmailEventType[]; counts?: EmailEventType[] }): Promise<void>;
  eventVolume(stream: EmailStream, days: number): Promise<Partial<Record<EmailEventType, number>>>;
}
