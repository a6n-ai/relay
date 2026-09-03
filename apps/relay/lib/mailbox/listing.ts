import {
  letterFilterKeys,
  type MailboxDirection,
  type MailboxOrigin,
  type MailboxOutboxStatus,
} from "@relay/engine";
import type { ListingBadge, ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { outboxStatusLabel } from "@/components/ds/plain-labels";
import { tagFilterKey } from "./conversation-tag";

export type AppMessageTag = { slug: string; label: string };

export type MailboxListRecord = {
  publicId: string;
  subject: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  tenantName: string | null;
  tenantPublicId?: string | null;
  status: MailboxOutboxStatus;
  direction: MailboxDirection;
  origin: MailboxOrigin;
  threadId?: string | null;
  createdAt?: number;
  tags?: AppMessageTag[];
  /** Must never be copied into searchText. */
  html?: string;
};

export function fromLine(fromEmail: string, fromName: string | null): string {
  if (!fromEmail) return "No From set";
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

export function conversationKey(r: { threadId?: string | null; publicId: string }): string {
  const thread = r.threadId?.trim();
  return thread || r.publicId;
}

function letterBadges(r: MailboxListRecord): ListingBadge[] {
  if (r.direction === "in") {
    return [{ label: "Received", variant: "secondary" }];
  }
  const status = r.status ?? "sent";
  const badges: ListingBadge[] = [
    { label: outboxStatusLabel(status), variant: status === "failed" ? "destructive" : "outline" },
  ];
  if (r.origin === "manual") {
    badges.unshift({ label: "Written here", variant: "secondary" });
  }
  return badges;
}

export function toMailboxListingRow(r: MailboxListRecord): ListingRow {
  const from = fromLine(r.fromEmail, r.fromName);
  const app = r.tenantName ?? "Relay";
  const badge = letterBadges(r)[0]?.label ?? "";
  const tags = r.tags ?? [];
  const tagLabels = tags.map((t) => t.label);
  const meta = `To ${r.toEmail} · From ${from} · ${app}`;
  return {
    id: r.publicId,
    title: r.subject,
    meta,
    href: `/dashboard/mailbox/${r.publicId}`,
    searchText: `${r.subject} ${r.toEmail} ${from} ${app} ${badge} ${tagLabels.join(" ")}`,
    filterKeys: [
      ...letterFilterKeys({
        direction: r.direction,
        origin: r.origin,
        outboxStatus: r.status,
      }),
      ...tags.map((t) => tagFilterKey(t.slug)),
    ],
    badges: [
      ...letterBadges(r),
      ...tags.map((t) => ({ label: t.label, variant: "outline" as const })),
    ],
  };
}

export function groupMailboxConversations(
  rows: MailboxListRecord[],
  tagsByTenantPublicId: Record<string, AppMessageTag[]>,
): ListingRow[] {
  const groups = new Map<string, MailboxListRecord[]>();
  for (const r of rows) {
    const key = conversationKey(r);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const out: ListingRow[] = [];
  for (const [, letters] of groups) {
    const latest = letters[0];
    if (!latest) continue;
    const tenantKey = latest.tenantPublicId?.trim() || "";
    const tags = tenantKey ? (tagsByTenantPublicId[tenantKey] ?? []) : [];
    const keys = new Set<string>();
    for (const letter of letters) {
      for (const k of letterFilterKeys({
        direction: letter.direction,
        origin: letter.origin,
        outboxStatus: letter.status,
      })) {
        keys.add(k);
      }
    }
    for (const t of tags) keys.add(tagFilterKey(t.slug));
    const row = toMailboxListingRow({ ...latest, tags });
    row.filterKeys = [...keys];
    if (letters.length > 1) {
      row.meta = `${letters.length} letters · ${row.meta}`;
    }
    out.push(row);
  }
  return out;
}

export function indexTagsByTenantPublicId(
  rows: Array<{ tenantPublicId: string; slug: string; label: string }>,
): Record<string, AppMessageTag[]> {
  const out: Record<string, AppMessageTag[]> = {};
  for (const r of rows) {
    const list = out[r.tenantPublicId] ?? [];
    list.push({ slug: r.slug, label: r.label });
    out[r.tenantPublicId] = list;
  }
  return out;
}

export function tagListingFilters(
  tagsByTenantPublicId: Record<string, AppMessageTag[]>,
): ListingFilter[] {
  const seen = new Map<string, string>();
  for (const tags of Object.values(tagsByTenantPublicId)) {
    for (const t of tags) {
      if (!seen.has(t.slug)) seen.set(t.slug, t.label);
    }
  }
  return [...seen.entries()].map(([slug, label]) => ({ id: tagFilterKey(slug), label }));
}
