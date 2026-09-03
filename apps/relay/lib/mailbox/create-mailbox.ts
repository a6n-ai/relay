import { PeopleMailError, assertPeopleMailboxEmail } from "@relay/engine";
import {
  defaultKindForNewMailbox,
  mailboxStoreForKind,
  type MailboxKind,
  type MailboxStore,
} from "./address-kinds";

const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

export function parseMailboxKind(raw: string | null | undefined): MailboxKind | null {
  switch (raw) {
    case "send_as":
    case "relay_inbox":
    case "people_inbox":
      return raw;
    case undefined:
    case null:
    case "":
      return null;
    default:
      return null;
  }
}

export function normalizeLocalPart(raw: string): string | null {
  const part = raw.trim().toLowerCase();
  if (!LOCAL_PART.test(part) || part.includes("@")) return null;
  return part;
}

export type PlanNewMailboxInput = {
  localPart: string;
  domain: string;
  kind?: string | null;
  existingCount: number;
  seatQuota: number;
  verifiedSendingDomains: readonly string[];
};

export type PlanNewMailboxOk = {
  email: string;
  localPart: string;
  domain: string;
  kind: MailboxKind;
  store: MailboxStore;
  createSender: boolean;
};

export function planNewMailbox(input: PlanNewMailboxInput): PlanNewMailboxOk | { error: string } {
  const localPart = normalizeLocalPart(input.localPart);
  if (!localPart) return { error: "Use a short name before the @, like support or receipts" };
  const domain = input.domain.trim().toLowerCase().replace(/\.$/, "");
  if (!domain || domain.includes("@") || domain.includes(" ")) {
    return { error: "Pick a domain" };
  }
  if (input.seatQuota > 0 && input.existingCount >= input.seatQuota) {
    return { error: "This app has no more addresses. Raise the address limit." };
  }
  const kind = parseMailboxKind(input.kind) ?? defaultKindForNewMailbox(localPart);
  const store = mailboxStoreForKind(kind);
  const email = `${localPart}@${domain}`;
  const sending = input.verifiedSendingDomains.map((d) => d.trim().toLowerCase());
  const onSending = sending.includes(domain);

  switch (kind) {
    case "people_inbox":
      try {
        assertPeopleMailboxEmail(email, sending);
      } catch (err) {
        if (err instanceof PeopleMailError) return { error: err.message };
        throw err;
      }
      return { email, localPart, domain, kind, store, createSender: false };
    case "send_as":
    case "relay_inbox":
      if (!onSending) return { error: "Prove the sending domain first" };
      return { email, localPart, domain, kind, store, createSender: true };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
