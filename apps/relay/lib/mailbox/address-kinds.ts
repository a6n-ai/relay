/**
 * Two catalogs on one domain. Never store the same letter in Postgres and a
 * people host unless a later sync rule exists.
 */
export type MailboxKind = "send_as" | "relay_inbox" | "people_inbox";

export type MailboxStore = "none" | "postgres" | "people_host";

export function mailboxStoreForKind(kind: MailboxKind): MailboxStore {
  switch (kind) {
    case "send_as":
      return "none";
    case "relay_inbox":
      return "postgres";
    case "people_inbox":
      return "people_host";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * When an app adds a local-part on a proven domain, pick the catalog.
 * receipts@ is send-as (no inbox). support@ is a Relay inbox. hello@ is people mail.
 */
export function defaultKindForNewMailbox(localPart: string): MailboxKind {
  const part = localPart.trim().toLowerCase();
  // TODO: extend this map for your product (billing@, founders@, …).
  if (part === "receipts" || part === "news" || part === "noreply" || part === "no-reply") {
    return "send_as";
  }
  if (part === "hello" || part === "team") {
    return "people_inbox";
  }
  return "relay_inbox";
}
