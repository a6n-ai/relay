import { EMAIL_EVENT_TYPES, type EmailEventType, type EmailStream } from "@relay/email";

const KINDS = ["untracked", "tracked", "marketing"];

export function parseEmailStreams(raw = process.env.RELAY_EMAIL_STREAMS): EmailStream[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(v)) return [];
    return v.filter(
      (s): s is EmailStream =>
        !!s && ["id", "label", "configSet"].every((k) => typeof s[k] === "string" && s[k]) && KINDS.includes(s.kind),
    );
  } catch {
    return [];
  }
}

export function parseRoutingInput(input: unknown): { webhook: EmailEventType[]; counts?: EmailEventType[] } | null {
  if (!input || typeof input !== "object") return null;
  const { webhook, counts } = input as Record<string, unknown>;
  const list = (v: unknown) =>
    Array.isArray(v) && v.every((t) => typeof t === "string" && (EMAIL_EVENT_TYPES as readonly string[]).includes(t))
      ? (v as EmailEventType[])
      : null;
  const w = list(webhook);
  if (!w) return null;
  if (counts === undefined) return { webhook: w };
  const c = list(counts);
  return c ? { webhook: w, counts: c } : null;
}
