import { and, inArray, isNotNull, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AudienceDef, CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import type { UsersRef } from "./enqueue";
import { marketingConsentBlockReason } from "./compliance";
import { normalizeAddress } from "./suppression";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface Recipient {
  userId?: bigint;
  email?: string;
  phone?: string;
  name?: string;
  vars?: Record<string, string>;
}

/** Defaults to CA so existing callers keep CASL purchase expiry. */
export function isConsentValid(
  source: string,
  consentAt: number,
  now: number,
  country = "CA",
): boolean {
  return marketingConsentBlockReason({
    country,
    consentSource: source,
    consentAt,
    now,
  }) === null;
}

/**
 * Collapse duplicates by normalized address. An entry with a user id wins,
 * because a known customer carries preferences and a locale that a bare list
 * row does not — but the list row's merge vars are kept, since that is the only
 * place they exist.
 */
export function dedupeRecipients(input: Recipient[]): Recipient[] {
  const byKey = new Map<string, Recipient>();
  for (const r of input) {
    const key = normalizeAddress(r.email ?? r.phone ?? "");
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r, email: r.email ? normalizeAddress(r.email) : undefined });
      continue;
    }
    byKey.set(key, {
      ...existing,
      userId: existing.userId ?? r.userId,
      name: existing.name ?? r.name,
      vars: { ...(r.vars ?? {}), ...(existing.vars ?? {}) },
    });
  }
  return [...byKey.values()];
}

export interface AudienceBreakdown {
  eligible: number;
  excluded: { unsubscribed: number; suppressed: number; noConsent: number; invalid: number; duplicates: number };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure half of audience resolution: dedupe, drop invalid and suppressed, and say why each was dropped. */
export function classifyAudience(input: {
  candidates: Recipient[];
  /** Members of lists whose implied consent lapsed — excluded before they became candidates. */
  lapsedListMembers: number;
  /** List members already stamped unsubscribed — also never candidates. */
  unsubscribedListMembers: number;
  suppressions: { address: string; reason: string }[];
}): { recipients: Recipient[]; breakdown: AudienceBreakdown } {
  const valid = input.candidates.filter(
    (r) => normalizeAddress(r.email ?? r.phone ?? "") && (!r.email || EMAIL_RE.test(r.email.trim()) || !!r.phone),
  );
  const invalid = input.candidates.length - valid.length;
  const deduped = dedupeRecipients(valid);
  const duplicates = valid.length - deduped.length;

  const reasonByAddress = new Map(input.suppressions.map((s) => [normalizeAddress(s.address), s.reason]));
  // Presence decides, not the text: a row with an empty reason still suppresses.
  const reasonFor = (address?: string) => {
    const key = address ? normalizeAddress(address) : "";
    return key && reasonByAddress.has(key) ? reasonByAddress.get(key)! : undefined;
  };
  let unsubscribed = input.unsubscribedListMembers;
  let suppressed = 0;
  const recipients = deduped.filter((r) => {
    const reason = reasonFor(r.email) ?? reasonFor(r.phone);
    if (reason === undefined) return true;
    if (reason === "unsubscribe") unsubscribed += 1;
    else suppressed += 1;
    return false;
  });

  return {
    recipients,
    breakdown: {
      eligible: recipients.length,
      excluded: { unsubscribed, suppressed, noConsent: input.lapsedListMembers, invalid, duplicates },
    },
  };
}

export interface AudienceDeps {
  db: Db;
  tables: NotificationTables & CampaignTables;
  users: UsersRef;
  /**
   * App-specific segment query. The package cannot know what an "order" is, so
   * each app supplies a resolver that turns a segment definition into user ids.
   */
  resolveSegment: (segment: NonNullable<AudienceDef["segment"]>) => Promise<bigint[]>;
  now?: number;
  /** ISO country for marketing rules. Defaults to CA (CASL). */
  mailingCountry?: string;
}

/**
 * Resolve an audience definition into deliverable recipients.
 *
 * Exclusions applied here, in order: lapsed implied consent, unsubscribed list
 * members, and any address suppressed for marketing. The suppression check runs
 * LAST and over the final address set, so a recipient reached through both a
 * segment and a list cannot slip past it on one path.
 */
export async function resolveAudienceDetailed(
  deps: AudienceDeps,
  def: AudienceDef,
): Promise<{ recipients: Recipient[]; breakdown: AudienceBreakdown }> {
  const { db, tables, users } = deps;
  const now = deps.now ?? Date.now();
  const mailingCountry = deps.mailingCountry ?? "CA";
  const out: Recipient[] = [];
  let lapsedListMembers = 0;
  let unsubscribedListMembers = 0;

  if (def.segment) {
    const ids = await deps.resolveSegment(def.segment);
    if (ids.length > 0) {
      const select: Record<string, unknown> = {
        id: users.columns.id,
        email: users.columns.email,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: (users.table as any).name,
      };
      if (users.columns.phone) select.phone = users.columns.phone;
      const rows = await db
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(select as any)
        .from(users.table)
        .where(inArray(users.columns.id, ids));
      for (const r of rows) {
        out.push({
          userId: r.id as bigint,
          email: (r.email as string | null) ?? undefined,
          phone: (r.phone as string | null) ?? undefined,
          name: (r.name as string | null) ?? undefined,
        });
      }
    }
  }

  if (def.listIds?.length) {
    const lists = await db
      .select({
        id: tables.contactList.id,
        source: tables.contactList.consentSource,
        consentAt: tables.contactList.consentAt,
      })
      .from(tables.contactList)
      .where(inArray(tables.contactList.publicId, def.listIds));

    // A list whose implied consent has lapsed contributes nobody. Filtering the
    // whole list is correct: consent_at is a property of how the list was
    // gathered, not of an individual row.
    const live = lists.filter((l) =>
      isConsentValid(l.source as string, Number(l.consentAt), now, mailingCountry),
    );

    const lapsedIds = lists.filter((l) => !live.includes(l)).map((l) => l.id);
    if (lapsedIds.length > 0) {
      lapsedListMembers = await db.$count(tables.contactListMember, inArray(tables.contactListMember.listId, lapsedIds));
    }

    if (live.length > 0) {
      const liveIds = live.map((l) => l.id);
      unsubscribedListMembers = await db.$count(
        tables.contactListMember,
        and(inArray(tables.contactListMember.listId, liveIds), isNotNull(tables.contactListMember.unsubscribedAt)),
      );
      const members = await db
        .select({
          email: tables.contactListMember.email,
          phone: tables.contactListMember.phone,
          name: tables.contactListMember.name,
          vars: tables.contactListMember.vars,
        })
        .from(tables.contactListMember)
        .where(
          and(
            inArray(
              tables.contactListMember.listId,
              live.map((l) => l.id),
            ),
            isNull(tables.contactListMember.unsubscribedAt),
          ),
        );
      for (const m of members) {
        out.push({
          email: (m.email as string | null) ?? undefined,
          phone: (m.phone as string | null) ?? undefined,
          name: (m.name as string | null) ?? undefined,
          vars: (m.vars as Record<string, string>) ?? {},
        });
      }
    }
  }

  const addresses = out.flatMap((r) => [r.email, r.phone].filter(Boolean) as string[]).map(normalizeAddress);
  const suppressions =
    addresses.length === 0
      ? []
      : await db
          .select({ address: tables.messageSuppression.address, reason: tables.messageSuppression.reason })
          .from(tables.messageSuppression)
          .where(
            and(
              inArray(tables.messageSuppression.address, addresses),
              inArray(tables.messageSuppression.scope, ["all", "marketing"]),
            ),
          );

  return classifyAudience({
    candidates: out,
    lapsedListMembers,
    unsubscribedListMembers,
    suppressions: suppressions as { address: string; reason: string }[],
  });
}

export async function resolveAudience(deps: AudienceDeps, def: AudienceDef): Promise<Recipient[]> {
  return (await resolveAudienceDetailed(deps, def)).recipients;
}

/** Live count for the audience builder. Same exclusions as the real send. */
export async function countAudience(deps: AudienceDeps, def: AudienceDef): Promise<number> {
  return (await resolveAudienceDetailed(deps, def)).breakdown.eligible;
}
