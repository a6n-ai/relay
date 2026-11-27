import { appId, cursor, status } from "../../lib/route-search";
import type { MessageStatus } from "../../shared/mail";

export type MessagesSearch = {
  dir: "out" | "in";
  appId?: string;
  status?: MessageStatus;
  email?: string;
  cursor?: string;
};

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

// Route validateSearch: a garbage value is dropped rather than failing the page. The server validates again at the fn boundary.
export function parseMessagesSearch(raw: Record<string, unknown>): MessagesSearch {
  return {
    dir: raw.dir === "in" ? "in" : "out",
    appId: appId(raw.appId),
    status: status(raw.status),
    email: text(raw.email),
    cursor: cursor(raw.cursor),
  };
}
