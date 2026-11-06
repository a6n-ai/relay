import type { EmailStream } from "@relay/email";

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
