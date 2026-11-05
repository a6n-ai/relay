import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveChannels, type PrefRow } from "./policy";
import type { NotificationTables } from "./schema";
import { normalizeAddress, suppressionRowsFor, type SuppressionScope } from "./suppression";
import type { Channel, Kind } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/** Default channels per kind when the caller does not name them explicitly. */
const DEFAULT_CHANNELS: Channel[] = ["in_app"];

export interface EnqueueInput {
  event?: string;
  /** Either a user id, or a literal address for a recipient with no account. */
  recipientId?: bigint;
  recipientEmail?: string;
  recipientPhone?: string;
  /** Shown in the in-app feed and used by the email template. */
  title: string;
  body: string;
  href?: string;
  /** Extra render data for templates. */
  data?: Record<string, unknown>;
  channels?: Channel[];
  kind?: Kind;
  campaignId?: bigint;
  /** Idempotency base; suffixed per channel so the same event enqueues once. */
  dedupeKey?: string;
  /**
   * Email only: files fetched by url at send time (like campaign attachments),
   * so the outbox row stores a link, not the bytes. The url must stay fetchable
   * without a session until the row sends or exhausts its retries.
   */
  attachments?: { filename: string; url: string; contentType: string }[];
}

/**
 * The app's users table, narrowed to the columns enqueue reads. Passed in
 * rather than imported so the package stays app-agnostic; `notifyEmail` and
 * `phone` are optional because not every app has them (puchkaman has no
 * notifyEmail column; some future app may have no phone column).
 */
export interface UsersRef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: { id: any; email: any; role?: any; status?: any; notifyEmail?: any; phone?: any };
}

/**
 * Write one outbox row per resolved (recipient, channel), inside the caller's
 * transaction so the notification commits atomically with the business change.
 *
 * Channel resolution = requested channels ∩ user prefs for this kind, minus any
 * channel suppressed for the recipient's addresses. Missing pref row =
 * channel allowed (default-on).
 */
export async function enqueue(
  tx: Db,
  tables: NotificationTables,
  users: UsersRef,
  input: EnqueueInput,
): Promise<void> {
  await enqueueMany(tx, tables, users, [input]);
}

/** Postgres caps a statement at 65535 params; an outbox row binds 9. */
const MANY_CHUNK = 500;

/**
 * `enqueue` for many recipients with the same rules, in 4 queries per 500
 * inputs (prefs, users, suppressions, insert) instead of 4 per recipient. A
 * campaign send loops thousands of recipients inside one Worker request, and
 * per-recipient round trips ran it past the CPU limit. Returns rows written.
 */
export async function enqueueMany(
  tx: Db,
  tables: NotificationTables,
  users: UsersRef,
  inputs: EnqueueInput[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < inputs.length; i += MANY_CHUNK) {
    written += await enqueueChunk(tx, tables, users, inputs.slice(i, i + MANY_CHUNK));
  }
  return written;
}

async function enqueueChunk(
  tx: Db,
  tables: NotificationTables,
  users: UsersRef,
  inputs: EnqueueInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const ids = [...new Set(inputs.flatMap((i) => (i.recipientId === undefined ? [] : [i.recipientId])))];

  const prefsByUser = new Map<string, PrefRow[]>();
  const userById = new Map<string, LookedUpUser>();
  if (ids.length) {
    const select: Record<string, unknown> = { id: users.columns.id, email: users.columns.email };
    if (users.columns.notifyEmail) select.notifyEmail = users.columns.notifyEmail;
    if (users.columns.phone) select.phone = users.columns.phone;
    // Sequential, not Promise.all: both run on the caller's single transaction connection.
    const prefRows = await tx
      .select({
        userId: tables.notificationPrefs.userId,
        channel: tables.notificationPrefs.channel,
        kind: tables.notificationPrefs.kind,
        enabled: tables.notificationPrefs.enabled,
      })
      .from(tables.notificationPrefs)
      .where(inArray(tables.notificationPrefs.userId, ids));
    const userRows = await tx
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(select as any)
      .from(users.table)
      .where(inArray(users.columns.id, ids));
    for (const p of prefRows) {
      const key = String(p.userId);
      const list = prefsByUser.get(key) ?? [];
      list.push({ channel: p.channel as Channel, kind: p.kind as Kind, enabled: p.enabled as boolean });
      prefsByUser.set(key, list);
    }
    for (const u of userRows as Record<string, unknown>[]) userById.set(String(u.id), u as LookedUpUser);
  }

  const addresses = inputs.flatMap((i) => {
    const u = i.recipientId === undefined ? undefined : userById.get(String(i.recipientId));
    return [i.recipientEmail ?? u?.email, i.recipientPhone ?? u?.phone].filter((a): a is string => !!a);
  });
  const suppressions = await suppressionRowsFor(tx, tables, addresses);

  const rows = planOutboxRows(inputs, { prefsByUser, userById, suppressions });
  if (rows.length === 0) return 0;
  await tx
    .insert(tables.notificationOutbox)
    .values(rows.map((r) => ({ ...r, event: r.event as never })))
    .onConflictDoNothing({ target: tables.notificationOutbox.dedupeKey });
  return rows.length;
}

export interface LookedUpUser {
  email?: string | null;
  phone?: string | null;
  notifyEmail?: boolean | null;
}

export interface SuppressionRow {
  address: string;
  channel: Channel;
  scope: SuppressionScope;
}

export interface PlannedOutboxRow {
  recipientId: bigint | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  channel: Channel;
  kind: Kind;
  event: string | null;
  campaignId: bigint | null;
  payload: Record<string, unknown>;
  dedupeKey: string | null;
}

/**
 * The pure half of enqueueMany: given what the batch lookups returned, the
 * outbox rows each input gets. A "marketing"-scoped suppression blocks only
 * marketing; an "all"-scoped one blocks every kind.
 */
export function planOutboxRows(
  inputs: EnqueueInput[],
  lookups: { prefsByUser: Map<string, PrefRow[]>; userById: Map<string, LookedUpUser>; suppressions: SuppressionRow[] },
): PlannedOutboxRow[] {
  const byAddress = new Map<string, SuppressionRow[]>();
  for (const s of lookups.suppressions) {
    const list = byAddress.get(s.address) ?? [];
    list.push(s);
    byAddress.set(s.address, list);
  }

  return inputs.flatMap((input) => {
    const kind = input.kind ?? "transactional";
    const key = input.recipientId === undefined ? undefined : String(input.recipientId);
    const user = key === undefined ? undefined : lookups.userById.get(key);
    const email = input.recipientEmail ?? user?.email ?? undefined;
    const phone = input.recipientPhone ?? user?.phone ?? undefined;
    const suppressed = [email, phone]
      .filter((a): a is string => !!a)
      .flatMap((a) => byAddress.get(normalizeAddress(a)) ?? [])
      .filter((s) => s.scope === "all" || kind === "marketing")
      .map((s) => s.channel);
    const allowed = resolveChannels(input.channels ?? DEFAULT_CHANNELS, key === undefined ? [] : (lookups.prefsByUser.get(key) ?? []), {
      kind,
      suppressed,
      notifyEmail: user?.notifyEmail ?? undefined,
    });

    // vars = entity-field snapshot used by templates; title/body feed the generic fallback.
    const payload = {
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      vars: input.data ?? {},
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    };
    return allowed.map((channel) => ({
      recipientId: input.recipientId ?? null,
      recipientEmail: email ?? null,
      recipientPhone: phone ?? null,
      channel,
      kind,
      event: input.event ?? null,
      campaignId: input.campaignId ?? null,
      payload,
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${channel}` : null,
    }));
  });
}

export interface EnqueueToRoleInput
  extends Omit<EnqueueInput, "recipientId" | "recipientEmail" | "recipientPhone"> {
  roles: string[];
}

/**
 * Fan an event out to every active user holding one of `roles`.
 *
 * Needed because puchkaman customers are guests who cannot log in: staff-facing
 * events ("a new order arrived") have no single recipient, and an in-app
 * notification addressed to a customer would have nowhere to appear.
 */
export async function enqueueToRole(
  tx: Db,
  tables: NotificationTables,
  users: UsersRef,
  input: EnqueueToRoleInput,
): Promise<void> {
  if (!users.columns.role || !users.columns.status) {
    throw new Error("enqueueToRole requires users.role and users.status columns");
  }
  const staff = await tx
    .select({ id: users.columns.id })
    .from(users.table)
    .where(and(inArray(users.columns.role, input.roles), eq(users.columns.status, "active")));

  await enqueueMany(
    tx,
    tables,
    users,
    staff.map((s) => ({
      ...input,
      recipientId: s.id as bigint,
      // Per-recipient dedupe suffix: one shared key would let the first staff
      // row win the unique index and silently drop everyone else.
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:u${s.id}` : undefined,
    })),
  );
}
