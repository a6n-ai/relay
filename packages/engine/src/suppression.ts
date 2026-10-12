import { and, eq, inArray, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { normalizeAddress } from "@foundry/commons";
import type { NotificationTables } from "./schema";
import type { Channel, Kind } from "./types";

export { normalizeAddress };

// Schema generic is loose (matches @foundry/database's Database type): these
// helpers only use the core query builder, and pinning a concrete schema would
// reject every app `db` — each app has its own schema shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export type SuppressionScope = "all" | "marketing";
export type SuppressionSource = "link" | "one-click" | "admin";

/**
 * Record a bounce, complaint, unsubscribe or manual block. Idempotent.
 *
 * `scope` defaults to "all" — the conservative direction. A caller that means
 * "marketing only" has to say so, because getting it backwards silently
 * suppresses receipts.
 */
export async function suppress(
  db: Db,
  tables: NotificationTables,
  input: { address: string; channel: Channel; reason: string; scope?: SuppressionScope; campaignId?: bigint; source?: SuppressionSource },
): Promise<void> {
  await db
    .insert(tables.messageSuppression)
    .values({
      address: normalizeAddress(input.address),
      channel: input.channel,
      scope: input.scope ?? "all",
      reason: input.reason,
      campaignId: input.campaignId ?? null,
      source: input.source ?? null,
    })
    .onConflictDoUpdate({
      target: [
        tables.messageSuppression.address,
        tables.messageSuppression.channel,
        tables.messageSuppression.scope,
      ],
      set: { reason: input.reason, campaignId: input.campaignId ?? null, source: input.source ?? null },
      // An unsubscribe is the recipient's decision: no later bounce/manual write may relabel it.
      setWhere: input.reason === "unsubscribe" ? undefined : ne(tables.messageSuppression.reason, "unsubscribe"),
    });
}

/**
 * Channels blocked for ANY of the given addresses (a recipient's email + phone),
 * for a message of this kind. A "marketing"-scoped row blocks only marketing;
 * an "all"-scoped row blocks both.
 */
export async function suppressedChannelsFor(
  db: Db,
  tables: NotificationTables,
  addresses: string[],
  kind: Kind = "transactional",
): Promise<Channel[]> {
  const normalized = addresses.filter(Boolean).map(normalizeAddress);
  if (normalized.length === 0) return [];
  const scopes: SuppressionScope[] = kind === "marketing" ? ["all", "marketing"] : ["all"];
  const rows = await db
    .select({ channel: tables.messageSuppression.channel })
    .from(tables.messageSuppression)
    .where(
      and(
        inArray(tables.messageSuppression.address, normalized),
        inArray(tables.messageSuppression.scope, scopes),
      ),
    );
  return [...new Set(rows.map((r) => r.channel as Channel))];
}

/** An unsubscribe is the recipient's decision; only they can reverse it (the resubscribe link). */
export function canClearSuppression(reason: string): boolean {
  return reason !== "unsubscribe";
}

type Outcome = { ok: true } | { error: string; status: number };

export async function clearSuppression(db: Db, tables: NotificationTables, publicId: string): Promise<Outcome> {
  // One conditional delete: the reason is checked by the statement that removes the row, so an
  // unsubscribe arriving between a read and a delete can never be wiped.
  const deleted = await db
    .delete(tables.messageSuppression)
    .where(and(eq(tables.messageSuppression.publicId, publicId), ne(tables.messageSuppression.reason, "unsubscribe")))
    .returning({ id: tables.messageSuppression.id });
  if (deleted.length) return { ok: true } as const;
  const [row] = await db
    .select({ id: tables.messageSuppression.id })
    .from(tables.messageSuppression)
    .where(eq(tables.messageSuppression.publicId, publicId));
  if (!row) return { error: "Not found", status: 404 } as const;
  return {
    error: "An unsubscribe can only be reversed by the recipient — send them a resubscribe link",
    status: 409,
  } as const;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

export async function suppressManually(
  db: Db,
  tables: NotificationTables,
  input: { address: string; channel: Channel },
): Promise<Outcome> {
  const address = input.address.trim();
  if (input.channel === "email" ? !EMAIL_RE.test(address) : !PHONE_RE.test(address.replace(/[\s()-]/g, ""))) {
    return {
      error: input.channel === "email" ? "Enter a valid email address" : "Enter a valid phone number",
      status: 422,
    } as const;
  }
  // Insert-only: overwriting would relabel a recipient's unsubscribe as "manual", which an admin could then clear.
  await db
    .insert(tables.messageSuppression)
    .values({ address: normalizeAddress(address), channel: input.channel, scope: "marketing", reason: "manual", source: "admin" })
    .onConflictDoNothing();
  return { ok: true } as const;
}
