import type { MessageStatus } from "../do/console-reads";

export type MessagesSearch = {
  dir: "out" | "in";
  appId?: string;
  status?: MessageStatus;
  email?: string;
  cursor?: string;
};

const STATUSES: MessageStatus[] = ["queued", "sent", "failed", "suppressed"];

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

// Route validateSearch: a garbage value is dropped rather than failing the page. The server validates again at the fn boundary.
export function parseMessagesSearch(raw: Record<string, unknown>): MessagesSearch {
  const status = STATUSES.find((s) => s === raw.status);
  return {
    dir: raw.dir === "in" ? "in" : "out",
    appId: text(raw.appId),
    status,
    email: text(raw.email),
    cursor: text(raw.cursor),
  };
}
