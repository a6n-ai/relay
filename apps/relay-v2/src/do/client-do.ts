import { DurableObject } from "cloudflare:workers";
import { and, eq, isNull, or, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { sendInputSchema, type SendInput, type Stream, type SuppressionReason } from "../core/send-input";
import { recordDoState } from "../core/workspace-profile";
import type { Env } from "../env";
import { newId } from "../lib/ids";
import * as schema from "./client-schema";
import { CLIENT_MIGRATIONS, migrate } from "./migrations";

export type MessageView = typeof schema.message.$inferSelect & { html: string | null };

type SendResult = { messageId: string; status: "queued" | "suppressed"; duplicate: boolean };

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
    const id = newId("msg");
    const preSuppressed = this.suppressed(data.to, data.stream);
    // shortcut: an R2 object orphaned by a crash between the put and the insert is never swept, add a sweeper when storage cost shows up.
    const htmlKey = preSuppressed ? null : `ws/${workspaceId}/msg/${id}.html`;
    if (htmlKey) await this.env.MAIL.put(htmlKey, data.html);
    const now = Date.now();
    let suppressed = preSuppressed;
    try {
      this.ctx.storage.transactionSync(() => {
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

  async addSuppression(workspaceId: string, email: string, reason: SuppressionReason, stream?: Stream): Promise<void> {
    await this.ready(workspaceId);
    // Widen on conflict: an all-streams row must never be narrowed by a later stream-scoped one.
    this.ctx.storage.transactionSync(() => {
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
    });
  }

  async isSuppressed(workspaceId: string, email: string, stream: Stream): Promise<boolean> {
    await this.ready(workspaceId);
    return this.suppressed(email.trim().toLowerCase(), stream);
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
    // Only queued and suppressed exist until the send worker lands.
    return row ? { messageId: row.id, status: row.status as SendResult["status"], duplicate: true } : undefined;
  }
}
