import { DurableObject } from "cloudflare:workers";
import { and, eq, gte, inArray, isNull, lt, ne, or, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { SesSendRequest } from "../core/ses";
import { DEFAULT_MONTHLY_QUOTA, LIMITS_TTL_MS, loadWorkspaceLimits, SENDER_RETRY_MS, type WorkspaceLimits } from "../core/limits";
import { sendInputSchema, type SendInput, type Stream, type SuppressionReason } from "../core/send-input";
import type { SesEventJob } from "../core/ses-events";
import { recordDoState } from "../core/workspace-profile";
import { utcDay } from "../core/usage";
import type { Env } from "../env";
import { newId } from "../lib/ids";
import * as schema from "./client-schema";
import { CLIENT_MIGRATIONS, migrate } from "./migrations";

export type MessageView = typeof schema.message.$inferSelect & { html: string | null };

type SendResult = { messageId: string; status: "queued" | "sent" | "failed" | "suppressed"; duplicate: boolean };

// failed: indexes into the input whose transaction threw. They rolled back alone and must be retried.
export type SesEventResult = {
  applied: number;
  ignored: number;
  failed: number[];
  usage: { day: string; delivered: number; bounced: number }[];
};

export type SendClaim =
  | { kind: "skip"; reason: "missing" | "sent" | "failed" | "suppressed" }
  | { kind: "busy"; retryInSeconds: number }
  | { kind: "send"; attempt: number; request: SesSendRequest };

const CLAIM_LEASE_MS = 60_000;
const SWEEP_INTERVAL_MS = 600_000;
// Longer than the largest retry backoff, so a row still waiting on a retry is never re-sent.
const STALE_MS = 1_200_000;
const EXPIRE_MS = 86_400_000;
const SWEEP_BATCH = 500;
const SWEEP_CHUNK = 100;

// Stored send errors keep the domain and first letter only, so a bounce never persists a full recipient address.
const maskEmails = (text: string) => text.replace(/([\w.%+-])[\w.%+-]*@([\w-]+(?:\.[\w-]+)+)/g, "$1***@$2").slice(0, 500);

// Higher rank wins a suppression conflict: a stronger reason is never replaced by a weaker one.
const reasonRank = (column: SQLWrapper) =>
  sql`CASE ${column} WHEN 'complaint' THEN 4 WHEN 'bounce' THEN 3 WHEN 'unsubscribe' THEN 2 ELSE 1 END`;

export class ClientDO extends DurableObject<Env> {
  readonly db: DrizzleSqliteDODatabase<typeof schema>;
  // Public so tests can force the failure path; a failed migration must never serve data.
  migrateError: Error | undefined;
  // Same-key sends share one in-flight promise, so a second caller never sees a row that is about to be rolled back.
  private readonly inFlight = new Map<string, Promise<SendResult>>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    ctx.blockConcurrencyWhile(async () => {
      try {
        migrate(ctx.storage);
      } catch (err) {
        this.migrateError = err instanceof Error ? err : new Error(String(err));
      }
    });
  }

  async ping(workspaceId: string): Promise<{ version: number }> {
    await this.ready(workspaceId);
    return { version: CLIENT_MIGRATIONS.length };
  }

  async send(workspaceId: string, input: SendInput): Promise<SendResult> {
    await this.ready(workspaceId);
    const data = sendInputSchema.parse(input);
    if (!data.idempotencyKey) return this.create(workspaceId, data);

    const key = `${data.appId}:${data.idempotencyKey}`;
    // No await between this check and the set, so a same-key caller always finds the entry.
    const pending = this.inFlight.get(key);
    if (pending) return { ...(await pending), duplicate: true };
    const existing = this.findByKey(data.appId, data.idempotencyKey);
    if (existing) return existing;

    const created = this.create(workspaceId, data).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, created);
    return created;
  }

  private async create(workspaceId: string, data: SendInput): Promise<SendResult> {
    const limits = await this.limits(workspaceId, { forSender: data.from });
    if (limits.status === "suspended") throw new Error("workspace_suspended");
    const sender = limits.senders[data.from];
    if (!sender) throw new Error("sender_not_verified");
    const id = newId("msg");
    const preSuppressed = this.suppressed(data.to, data.stream);
    // shortcut: an R2 object orphaned by a crash between the put and the insert is never swept, add a sweeper when storage cost shows up.
    const htmlKey = preSuppressed ? null : `ws/${workspaceId}/msg/${id}.html`;
    if (htmlKey) await this.env.MAIL.put(htmlKey, data.html);
    const now = Date.now();
    // Set before the insert: a crash between insert and enqueue must still leave an alarm to sweep the row.
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    let suppressed = preSuppressed;
    try {
      this.ctx.storage.transactionSync(() => {
        // Counted in the same synchronous transaction as the insert, so concurrent sends cannot both take the last slot.
        const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
        const used = this.db
          .select({ n: sql<number>`count(*)` })
          .from(schema.message)
          .where(
            and(
              eq(schema.message.direction, "out"),
              inArray(schema.message.status, ["queued", "sent"]),
              gte(schema.message.createdAt, monthStart),
            ),
          )
          .get();
        if (limits.monthlyQuota > 0 && (used?.n ?? 0) >= limits.monthlyQuota) throw new Error("quota_exceeded");
        // Re-checked here: an unsubscribe can land during the R2 put above.
        suppressed = this.suppressed(data.to, data.stream);
        this.db
          .insert(schema.message)
          .values({
            id,
            appId: data.appId,
            direction: "out",
            stream: data.stream,
            status: suppressed ? "suppressed" : "queued",
            idempotencyKey: data.idempotencyKey ?? null,
            event: data.event ?? null,
            campaignId: data.campaignId ?? null,
            fromEmail: data.from,
            fromName: sender.name,
            sesRegion: sender.sesRegion,
            toEmail: data.to,
            subject: data.subject,
            text: data.text,
            htmlKey: suppressed ? null : htmlKey,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      });
    } catch (err) {
      await this.dropHtml(htmlKey);
      throw err;
    }
    if (suppressed) {
      await this.dropHtml(htmlKey);
      return { messageId: id, status: "suppressed", duplicate: false };
    }
    try {
      await this.env.SEND.send({ workspaceId, messageId: id });
    } catch (err) {
      // Keep no row: a same-key retry would otherwise return duplicate and never enqueue.
      this.ctx.storage.transactionSync(() => {
        this.db.delete(schema.message).where(eq(schema.message.id, id)).run();
      });
      await this.dropHtml(htmlKey);
      throw err;
    }
    return { messageId: id, status: "queued", duplicate: false };
  }

  // A failed delete must not replace the error that caused the rollback.
  private async dropHtml(htmlKey: string | null): Promise<void> {
    if (!htmlKey) return;
    try {
      await this.env.MAIL.delete(htmlKey);
    } catch (err) {
      console.error("ClientDO: failed to delete html object", htmlKey, err);
    }
  }

  async getMessage(workspaceId: string, id: string): Promise<MessageView | null> {
    await this.ready(workspaceId);
    const row = this.db.select().from(schema.message).where(eq(schema.message.id, id)).get();
    if (!row) return null;
    const object = row.htmlKey ? await this.env.MAIL.get(row.htmlKey) : null;
    return { ...row, html: object ? await object.text() : null };
  }

  // A lease (claimed_until) stops a second job from sending while the first is in flight.
  async claimSend(workspaceId: string, messageId: string, now = Date.now()): Promise<SendClaim> {
    await this.ready(workspaceId);
    const claimed = this.ctx.storage.transactionSync(():
      | SendClaim
      | { kind: "claimed"; attempt: number; row: typeof schema.message.$inferSelect; region: string }
      | { kind: "suppressed"; htmlKey: string | null } => {
      const row = this.db.select().from(schema.message).where(eq(schema.message.id, messageId)).get();
      if (!row) return { kind: "skip", reason: "missing" };
      if (row.status !== "queued" || row.sesMessageId) {
        return { kind: "skip", reason: row.status === "queued" ? "sent" : (row.status as "sent" | "failed" | "suppressed") };
      }
      if (row.claimedUntil != null && row.claimedUntil > now) {
        return { kind: "busy", retryInSeconds: Math.ceil((row.claimedUntil - now) / 1000) };
      }
      // Re-checked at claim time: a bounce or complaint can land while the row waits in the queue.
      if (this.suppressed(row.toEmail ?? "", row.stream as Stream)) {
        this.db
          .update(schema.message)
          .set({ status: "suppressed", htmlKey: null, claimedUntil: null, updatedAt: now })
          .where(eq(schema.message.id, messageId))
          .run();
        return { kind: "suppressed", htmlKey: row.htmlKey };
      }
      const region = row.sesRegion;
      if (!region) {
        this.db
          .update(schema.message)
          .set({ status: "failed", error: "no SES region", claimedUntil: null, updatedAt: now })
          .where(eq(schema.message.id, messageId))
          .run();
        return { kind: "skip", reason: "failed" };
      }
      const attempt = row.attempts + 1;
      this.db
        .update(schema.message)
        .set({ claimedUntil: now + CLAIM_LEASE_MS, attempts: attempt, updatedAt: now })
        .where(eq(schema.message.id, messageId))
        .run();
      return { kind: "claimed", attempt, row, region };
    });
    if (claimed.kind === "suppressed") {
      await this.dropHtml(claimed.htmlKey);
      return { kind: "skip", reason: "suppressed" };
    }
    if (claimed.kind !== "claimed") return claimed;

    const { row, attempt, region } = claimed;
    const object = row.htmlKey ? await this.env.MAIL.get(row.htmlKey) : null;
    if (row.htmlKey && !object) {
      this.ctx.storage.transactionSync(() => {
        this.db
          .update(schema.message)
          .set({ status: "failed", error: "html missing", claimedUntil: null, updatedAt: Date.now() })
          .where(eq(schema.message.id, messageId))
          .run();
      });
      return { kind: "skip", reason: "failed" };
    }
    return {
      kind: "send",
      attempt,
      request: {
        region,
        stream: row.stream as Stream,
        from: row.fromEmail ?? "",
        fromName: row.fromName,
        to: row.toEmail ?? "",
        subject: row.subject ?? "",
        html: object ? await object.text() : null,
        text: row.text ?? "",
        tags: { ws: workspaceId, msg: messageId },
      },
    };
  }

  // SES accepted the message. Idempotent; a failed row is overwritten because SES has the message.
  // Returns true only when this call changed the row, so the caller counts each send once.
  async markSent(workspaceId: string, messageId: string, sesMessageId: string, now = Date.now()): Promise<boolean> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(
      () =>
        this.db
          .update(schema.message)
          .set({ status: "sent", sesMessageId, sentAt: now, claimedUntil: null, error: null, updatedAt: now })
          .where(and(eq(schema.message.id, messageId), ne(schema.message.status, "sent")))
          .returning({ id: schema.message.id })
          .all().length > 0,
    );
  }

  async markSendFailed(workspaceId: string, messageId: string, error: string, final: boolean): Promise<void> {
    await this.ready(workspaceId);
    this.ctx.storage.transactionSync(() => {
      this.db
        .update(schema.message)
        .set({ error: maskEmails(error), claimedUntil: null, updatedAt: Date.now(), ...(final ? { status: "failed" as const } : {}) })
        .where(and(eq(schema.message.id, messageId), ne(schema.message.status, "sent")))
        .run();
    });
  }

  async addSuppression(workspaceId: string, email: string, reason: SuppressionReason, stream?: Stream): Promise<void> {
    await this.ready(workspaceId);
    this.ctx.storage.transactionSync(() => this.writeSuppression(email, reason, stream));
  }

  // One transactionSync per event. A replayed, foreign or unknown event changes nothing and counts as ignored.
  // Usage is returned rather than written, so the queue bumps it only after this call succeeds.
  async applySesEvents(workspaceId: string, events: SesEventJob[]): Promise<SesEventResult> {
    await this.ready(workspaceId);
    const result: SesEventResult = { applied: 0, ignored: 0, failed: [], usage: [] };
    const days = new Map<string, { delivered: number; bounced: number }>();
    for (const [index, job] of events.entries()) {
      let delta: { delivered: number; bounced: number } | null;
      try {
        delta = this.ctx.storage.transactionSync(() => this.applySesEvent(workspaceId, job));
      } catch (err) {
        // Only this event rolls back; the rest of the group still commits.
        console.error("ClientDO: ses event failed, retrying", job.snsMessageId, err instanceof Error ? err.name : "unknown");
        result.failed.push(index);
        continue;
      }
      if (!delta) {
        result.ignored++;
        continue;
      }
      result.applied++;
      const day = utcDay(job.occurredAt);
      const usage = days.get(day) ?? { delivered: 0, bounced: 0 };
      usage.delivered += delta.delivered;
      usage.bounced += delta.bounced;
      days.set(day, usage);
    }
    result.usage = [...days].filter(([, u]) => u.delivered || u.bounced).map(([day, u]) => ({ day, ...u }));
    return result;
  }

  // Returns the usage this event adds, or null when it is ignored. Must run inside transactionSync.
  private applySesEvent(workspaceId: string, job: SesEventJob): { delivered: number; bounced: number } | null {
    if (job.workspaceId !== workspaceId) return null;
    const row = this.db
      .select({ sesMessageId: schema.message.sesMessageId })
      .from(schema.message)
      .where(eq(schema.message.id, job.messageId))
      .get();
    if (!row || (row.sesMessageId && row.sesMessageId !== job.sesMessageId)) return null;
    const detail = job.bounceType || job.link ? JSON.stringify({ bounceType: job.bounceType, link: job.link }) : null;
    const inserted = this.db
      .insert(schema.messageEvent)
      .values({
        messageId: job.messageId,
        type: job.type,
        snsMessageId: job.snsMessageId,
        recipient: job.recipients[0] ?? null,
        detail,
        occurredAt: job.occurredAt,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({ target: schema.messageEvent.snsMessageId })
      .returning({ id: schema.messageEvent.id })
      .all();
    if (inserted.length === 0) return null;
    const usage = { delivered: 0, bounced: 0 };
    switch (job.type) {
      case "Open":
        this.db
          .update(schema.message)
          .set({ opens: sql`${schema.message.opens} + 1` })
          .where(eq(schema.message.id, job.messageId))
          .run();
        break;
      case "Click":
        this.db
          .update(schema.message)
          .set({ clicks: sql`${schema.message.clicks} + 1` })
          .where(eq(schema.message.id, job.messageId))
          .run();
        break;
      case "Delivery":
        usage.delivered = 1;
        break;
      case "Bounce":
        usage.bounced = 1;
        if (job.bounceType === "Permanent") for (const r of job.recipients) this.writeSuppression(r, "bounce");
        break;
      case "Complaint":
        for (const r of job.recipients) this.writeSuppression(r, "complaint");
        break;
    }
    return usage;
  }

  private writeSuppression(email: string, reason: SuppressionReason, stream?: Stream): void {
    // Widen on conflict: an all-streams row must never be narrowed by a later stream-scoped one.
    this.db
      .insert(schema.suppression)
      .values({ email: email.trim().toLowerCase(), reason, stream: stream ?? null, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: schema.suppression.email,
        set: {
          reason: sql`CASE WHEN (${reasonRank(schema.suppression.reason)}) >= (${reasonRank(sql.raw("excluded.reason"))}) THEN ${schema.suppression.reason} ELSE excluded.reason END`,
          stream: sql`CASE WHEN ${schema.suppression.stream} IS NULL OR excluded.stream IS NULL OR ${schema.suppression.stream} <> excluded.stream THEN NULL ELSE excluded.stream END`,
        },
      })
      .run();
  }

  async isSuppressed(workspaceId: string, email: string, stream: Stream): Promise<boolean> {
    await this.ready(workspaceId);
    return this.suppressed(email.trim().toLowerCase(), stream);
  }

  async refreshLimits(workspaceId: string): Promise<WorkspaceLimits> {
    await this.ready(workspaceId);
    return this.loadLimits(workspaceId);
  }

  async alarm(): Promise<void> {
    await this.sweepQueued();
  }

  // Workspace comes only from the KV binding. Unbound: nothing to sweep, and no reschedule.
  async sweepQueued(now = Date.now()): Promise<{ requeued: number; expired: number }> {
    const workspaceId = this.ctx.storage.kv.get<string>("workspace_id");
    if (workspaceId === undefined) {
      console.error("ClientDO: sweeper ran before any workspace was bound");
      return { requeued: 0, expired: 0 };
    }
    await this.ready(workspaceId);
    const expired = this.ctx.storage.transactionSync(
      () =>
        this.db
          .update(schema.message)
          .set({ status: "failed", error: "expired after 24h in queue", updatedAt: now })
          .where(and(eq(schema.message.status, "queued"), lt(schema.message.createdAt, now - EXPIRE_MS)))
          .returning({ id: schema.message.id })
          .all().length,
    );
    const stale = this.db
      .select({ id: schema.message.id })
      .from(schema.message)
      .where(
        and(
          eq(schema.message.status, "queued"),
          lt(schema.message.updatedAt, now - STALE_MS),
          or(isNull(schema.message.claimedUntil), lt(schema.message.claimedUntil, now)),
        ),
      )
      .orderBy(schema.message.createdAt)
      .limit(SWEEP_BATCH)
      .all();
    // Before the enqueue loop: if sendBatch keeps throwing past the alarm retries, the next sweep is still scheduled.
    if (stale.length > 0) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    for (let i = 0; i < stale.length; i += SWEEP_CHUNK) {
      const ids = stale.slice(i, i + SWEEP_CHUNK).map((row) => row.id);
      await this.env.SEND.sendBatch(ids.map((messageId) => ({ body: { workspaceId, messageId } })));
      // Per chunk, after its enqueue: a throw in a later chunk leaves the sent ones fresh for the next run.
      // One update per id: DO SQL caps bound parameters per query, so an IN list of 100 would not fit.
      this.ctx.storage.transactionSync(() => {
        for (const id of ids) this.db.update(schema.message).set({ updatedAt: now }).where(eq(schema.message.id, id)).run();
      });
    }
    const queuedLeft = this.db
      .select({ id: schema.message.id })
      .from(schema.message)
      .where(eq(schema.message.status, "queued"))
      .limit(1)
      .get();
    if (queuedLeft) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    return { requeued: stale.length, expired };
  }

  // The snapshot lives in KV, so a stale copy survives eviction and a D1 outage. It is never stored when empty.
  private async limits(workspaceId: string, { forSender }: { forSender?: string } = {}): Promise<WorkspaceLimits> {
    const cached = this.ctx.storage.kv.get<WorkspaceLimits>("limits");
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    const senderMiss = forSender !== undefined && !cached?.senders[forSender];
    if (cached && age < LIMITS_TTL_MS && !(senderMiss && age > SENDER_RETRY_MS)) return cached;
    try {
      return await this.loadLimits(workspaceId);
    } catch (err) {
      console.error("ClientDO: failed to reload workspace limits, using the cached snapshot", err);
      return cached ?? { monthlyQuota: DEFAULT_MONTHLY_QUOTA, status: "active", senders: {}, fetchedAt: 0 };
    }
  }

  private async loadLimits(workspaceId: string): Promise<WorkspaceLimits> {
    const snapshot = await loadWorkspaceLimits(this.env, workspaceId);
    this.ctx.storage.kv.put("limits", snapshot);
    return snapshot;
  }

  private async ready(workspaceId: string): Promise<void> {
    this.bind(workspaceId);
    if (this.migrateError) {
      try {
        await recordDoState(this.env, workspaceId, { doMigrateError: this.migrateError.message });
      } catch (err) {
        console.error("ClientDO: failed to record migrate error in D1", err);
      }
      throw new Error("workspace storage migration failed");
    }
    await this.reportVersion(workspaceId);
  }

  // D1 is written once per schema version per DO: KV remembers what was last reported.
  // A D1 failure must not block sends, so KV stays unset and the next call retries.
  private async reportVersion(workspaceId: string): Promise<void> {
    const version = CLIENT_MIGRATIONS.length;
    if (this.ctx.storage.kv.get<number>("reported_version") === version) return;
    try {
      // false: relay-security has no such workspace, so nothing is reported and KV stays unset.
      if (!(await recordDoState(this.env, workspaceId, { doSchemaVersion: version, doMigrateError: null }))) return;
    } catch (err) {
      console.error("ClientDO: failed to report schema version to D1", err);
      return;
    }
    this.ctx.storage.kv.put("reported_version", version);
  }

  // Named ids (idFromName) are checked against their name. Unnamed ids fall back to the KV binding, which the alarm reads.
  private bind(workspaceId: string): void {
    const name = this.ctx.id.name;
    if (name !== undefined && name !== workspaceId) throw new Error("workspace mismatch");
    const bound = this.ctx.storage.kv.get<string>("workspace_id");
    if (bound === undefined) this.ctx.storage.kv.put("workspace_id", workspaceId);
    else if (bound !== workspaceId) throw new Error("workspace mismatch");
  }

  private suppressed(email: string, stream: Stream): boolean {
    return (
      this.db
        .select({ email: schema.suppression.email })
        .from(schema.suppression)
        .where(
          and(
            eq(schema.suppression.email, email),
            or(isNull(schema.suppression.stream), eq(schema.suppression.stream, stream)),
          ),
        )
        .get() !== undefined
    );
  }

  private findByKey(appId: string, key: string): SendResult | undefined {
    const row = this.db
      .select({ id: schema.message.id, status: schema.message.status })
      .from(schema.message)
      .where(and(eq(schema.message.appId, appId), eq(schema.message.idempotencyKey, key)))
      .get();
    return row ? { messageId: row.id, status: row.status as SendResult["status"], duplicate: true } : undefined;
  }
}
