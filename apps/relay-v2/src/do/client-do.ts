import { DurableObject } from "cloudflare:workers";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { sendInputSchema, type SendInput, type Stream, type SuppressionReason } from "../core/send-input";
import type { Env } from "../env";
import { newId } from "../lib/ids";
import * as schema from "./client-schema";
import { migrate } from "./migrations";

export type MessageView = typeof schema.message.$inferSelect & { html: string | null };

type SendResult = { messageId: string; status: "queued" | "suppressed"; duplicate: boolean };

export class ClientDO extends DurableObject<Env> {
  readonly db: DrizzleSqliteDODatabase<typeof schema>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    ctx.blockConcurrencyWhile(async () => {
      migrate(ctx.storage);
    });
  }

  ping(): string {
    return "ok";
  }

  async send(workspaceId: string, input: SendInput): Promise<SendResult> {
    const data = sendInputSchema.parse(input);
    const existing = data.idempotencyKey ? this.findByKey(data.appId, data.idempotencyKey) : undefined;
    if (existing) return existing;

    const id = newId("msg");
    const suppressed = this.suppressed(data.to, data.stream);
    // shortcut: an R2 object orphaned by a crash between the put and the insert is never swept, add a sweeper when storage cost shows up.
    const htmlKey = suppressed ? null : `ws/${workspaceId}/msg/${id}.html`;
    if (htmlKey) await this.env.MAIL.put(htmlKey, data.html);
    const now = Date.now();
    try {
      this.ctx.storage.transactionSync(() => {
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
            htmlKey,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      });
    } catch (err) {
      if (htmlKey) await this.env.MAIL.delete(htmlKey);
      // A concurrent send with the same key may have inserted first.
      const raced = data.idempotencyKey ? this.findByKey(data.appId, data.idempotencyKey) : undefined;
      if (raced) return raced;
      throw err;
    }
    if (suppressed) return { messageId: id, status: "suppressed", duplicate: false };
    try {
      await this.env.SEND.send({ workspaceId, messageId: id });
    } catch (err) {
      // Keep no row: a same-key retry would otherwise return duplicate and never enqueue.
      this.ctx.storage.transactionSync(() => {
        this.db.delete(schema.message).where(eq(schema.message.id, id)).run();
      });
      if (htmlKey) await this.env.MAIL.delete(htmlKey);
      throw err;
    }
    return { messageId: id, status: "queued", duplicate: false };
  }

  async getMessage(id: string): Promise<MessageView | null> {
    const row = this.db.select().from(schema.message).where(eq(schema.message.id, id)).get();
    if (!row) return null;
    const object = row.htmlKey ? await this.env.MAIL.get(row.htmlKey) : null;
    return { ...row, html: object ? await object.text() : null };
  }

  async addSuppression(email: string, reason: SuppressionReason, stream?: Stream): Promise<void> {
    // Widen on conflict: an all-streams row must never be narrowed by a later stream-scoped one.
    this.db
      .insert(schema.suppression)
      .values({ email: email.trim().toLowerCase(), reason, stream: stream ?? null, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: schema.suppression.email,
        set: {
          reason,
          stream: sql`CASE WHEN ${schema.suppression.stream} IS NULL OR excluded.stream IS NULL OR ${schema.suppression.stream} <> excluded.stream THEN NULL ELSE excluded.stream END`,
        },
      })
      .run();
  }

  async isSuppressed(email: string, stream: Stream): Promise<boolean> {
    return this.suppressed(email.trim().toLowerCase(), stream);
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
