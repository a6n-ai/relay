import { status, str, trimmed } from "../lib/route-search";
import type { MessageStatus } from "../../shared/mail";

export type MessagesSearch = {
  dir: "out" | "in";
  appId?: string;
  status?: MessageStatus;
  email?: string;
  cursor?: string;
};

// Route validateSearch: a garbage value is dropped rather than failing the page. The server validates again at the fn boundary.
export function parseMessagesSearch(raw: Record<string, unknown>): MessagesSearch {
  return {
    dir: raw.dir === "in" ? "in" : "out",
    appId: str(raw.appId),
    status: status(raw.status),
    email: trimmed(raw.email),
    cursor: str(raw.cursor),
  };
}
