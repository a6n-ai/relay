import { and, eq, or, sql } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { MAX_INBOUND_BYTES } from "../core/email-worker";
import { InboundParseError, parseInboundEml, safeFilename, type ParsedInbound } from "../core/inbound-parse";
import { mailboxReceivedJson } from "../core/mailbox-received";
import type { Env, InboundJob } from "../env";
import { newId } from "../lib/ids";
import * as schema from "./client-schema";
import { listWebhookRows, toWebhookView } from "./webhooks";
import { describeError } from "../core/log";

export type InboundResult =
  | { outcome: "inserted"; messageId: string; deliveries: number }
  | { outcome: "duplicate"; messageId: string }
  | { outcome: "failed"; error: string };

export type InboundDeps = { storage: DurableObjectStorage; db: DrizzleSqliteDODatabase<typeof schema>; env: Env };

// Keeps a DO row under 2 MB; the webhook payload keeps the full text.
const INBOUND_TEXT_MAX = 262_144;
const SUBJECT_MAX = 998;
const EVENT = "mailbox.received";

function assertOwnRawKey(workspaceId: string, rawKey: string): void {
  if (!rawKey.startsWith(`ws/${workspaceId}/raw/`)) throw new Error("raw key outside workspace");
}

// Stored without angle brackets so threading lookups match rfc_message_id.
function bareIds(value: string | null): string | null {
  const ids = (value ?? "")
    .split(/\s+/)
    .map((id) => id.replace(/^<(.*)>$/, "$1"))
    .filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : null;
}

export function writeInboundFailure(deps: InboundDeps, workspaceId: string, job: InboundJob, error: string): void {
  assertOwnRawKey(workspaceId, job.rawKey);
  const now = Date.now();
  deps.storage.transactionSync(() => {
    const stored = deps.db
      .select({ id: schema.message.id })
      .from(schema.message)
      .where(eq(schema.message.rawKey, job.rawKey))
      .get();
    if (stored) return;
    deps.db
      .insert(schema.inboundFailure)
      .values({
        rawKey: job.rawKey,
        appId: job.appId,
        addressId: job.addressId,
        envelopeFrom: job.envelopeFrom,
        envelopeTo: job.envelopeTo,
        authResults: job.authResults,
        receivedAt: job.receivedAt,
        error,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.inboundFailure.rawKey,
        set: { attempts: sql`${schema.inboundFailure.attempts} + 1`, error, updatedAt: now },
      })
      .run();
  });
}

async function putObject(env: Env, written: string[], key: string, body: string | ArrayBuffer): Promise<void> {
  // Recorded before the put: a put that fails midway may still have written the object.
  written.push(key);
  await env.MAIL.put(key, body);
}

async function removeObjects(env: Env, messageId: string, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      env.MAIL.delete(key).catch((err: unknown) => console.error("inbound: failed to delete object", messageId, describeError(err))),
    ),
  );
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}

function fail(deps: InboundDeps, workspaceId: string, job: InboundJob, error: string): InboundResult {
  writeInboundFailure(deps, workspaceId, job, error);
  return { outcome: "failed", error };
}

type Stored =
  | { duplicate: { id: string; rawKey: string | null } }
  | { duplicate: null; messageId: string; deliveryIds: string[] };

export async function storeInbound(deps: InboundDeps, workspaceId: string, job: InboundJob): Promise<InboundResult> {
  const { storage, db, env } = deps;
  assertOwnRawKey(workspaceId, job.rawKey);
  const sameLetter = db
    .select({ id: schema.message.id })
    .from(schema.message)
    .where(eq(schema.message.rawKey, job.rawKey))
    .get();
  if (sameLetter) return { outcome: "duplicate", messageId: sameLetter.id };

  const object = await env.MAIL.get(job.rawKey);
  if (!object) throw new Error("raw mail missing");
  if (object.size > MAX_INBOUND_BYTES) return fail(deps, workspaceId, job, "Letter too large");

  let parsed: ParsedInbound;
  try {
    parsed = await parseInboundEml(await object.arrayBuffer());
  } catch (err) {
    if (!(err instanceof InboundParseError)) throw err;
    return fail(deps, workspaceId, job, err.message);
  }

  const sameMessage = db
    .select({ id: schema.message.id, rawKey: schema.message.rawKey })
    .from(schema.message)
    .where(
      and(
        eq(schema.message.appId, job.appId),
        eq(schema.message.direction, "in"),
        eq(schema.message.rfcMessageId, parsed.rfcMessageId),
      ),
    )
    .get();
  if (sameMessage) {
    if (sameMessage.rawKey === job.rawKey) return { outcome: "duplicate", messageId: sameMessage.id };
    db.delete(schema.inboundFailure).where(eq(schema.inboundFailure.rawKey, job.rawKey)).run();
    await env.MAIL.delete(job.rawKey);
    return { outcome: "duplicate", messageId: sameMessage.id };
  }

  const messageId = newId("msg");
  const webhooks = listWebhookRows(db, job.appId)
    .map(toWebhookView)
    .filter((w) => w.enabled && w.events.includes(EVENT));
  const htmlKey = parsed.html ? `ws/${workspaceId}/msg/${messageId}.html` : null;
  const payloadKey = `ws/${workspaceId}/msg/${messageId}.received.json`;
  const attachments = parsed.attachments.map((a, position) => {
    const filename = safeFilename(a.filename);
    return {
      messageId,
      appId: job.appId,
      position,
      filename,
      contentType: a.mimeType,
      sizeBytes: a.content.byteLength,
      contentId: a.contentId,
      r2Key: `ws/${workspaceId}/att/${messageId}/${position}-${filename}`,
      createdAt: job.receivedAt,
    };
  });

  // shortcut: R2 objects written before a crash that precedes the insert are orphaned, add a sweeper when storage cost shows up
  const written: string[] = [];
  let stored: Stored;
  try {
    if (htmlKey) await putObject(env, written, htmlKey, parsed.html);
    for (const [position, row] of attachments.entries()) {
      await putObject(env, written, row.r2Key, parsed.attachments[position].content);
    }
    if (webhooks.length > 0) {
      await putObject(
        env,
        written,
        payloadKey,
        mailboxReceivedJson({
          to: parsed.toEmail ?? job.envelopeTo,
          from: parsed.fromEmail,
          html: parsed.html,
          text: parsed.text,
          subject: parsed.subject,
          fromName: parsed.fromName,
          messageId,
          envelopeTo: job.envelopeTo,
          receivedAt: job.receivedAt,
          authResults: job.authResults,
          envelopeFrom: job.envelopeFrom,
        }),
      );
    }

    stored = storage.transactionSync((): Stored => {
      const inserted = db
        .insert(schema.message)
        .values({
          id: messageId,
          appId: job.appId,
          direction: "in",
          stream: "transactional",
          status: "sent",
          fromEmail: parsed.fromEmail,
          fromName: parsed.fromName,
          toEmail: job.envelopeTo,
          subject: parsed.subject.slice(0, SUBJECT_MAX),
          text: parsed.text.slice(0, INBOUND_TEXT_MAX),
          htmlKey,
          rawKey: job.rawKey,
          addressId: job.addressId,
          rfcMessageId: parsed.rfcMessageId,
          inReplyTo: bareIds(parsed.inReplyTo),
          rfcReferences: bareIds(parsed.references),
          envelopeFrom: job.envelopeFrom,
          authResults: job.authResults,
          sentAt: parsed.sentAt,
          createdAt: job.receivedAt,
          updatedAt: job.receivedAt,
        })
        .onConflictDoNothing()
        .returning({ id: schema.message.id })
        .all();
      if (inserted.length === 0) {
        const existing = db
          .select({ id: schema.message.id, rawKey: schema.message.rawKey })
          .from(schema.message)
          .where(
            or(
              eq(schema.message.rawKey, job.rawKey),
              and(
                eq(schema.message.appId, job.appId),
                eq(schema.message.direction, "in"),
                eq(schema.message.rfcMessageId, parsed.rfcMessageId),
              ),
            ),
          )
          .get();
        if (!existing) throw new Error("inbound insert conflict without a matching message");
        if (existing.rawKey !== job.rawKey) db.delete(schema.inboundFailure).where(eq(schema.inboundFailure.rawKey, job.rawKey)).run();
        return { duplicate: existing };
      }

      // One row per statement: a multi-row VALUES list can exceed the DO SQLite limit of 100 bound parameters.
      for (const row of attachments) db.insert(schema.attachment).values(row).run();
      const now = Date.now();
      const deliveryIds = webhooks.map(
        (w) =>
          db
            .insert(schema.webhookDelivery)
            .values({
              webhookId: w.id,
              appId: job.appId,
              messageId,
              event: EVENT,
              payloadKey,
              nextAttemptAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: schema.webhookDelivery.id })
            .get().id,
      );
      db.delete(schema.inboundFailure).where(eq(schema.inboundFailure.rawKey, job.rawKey)).run();
      return { duplicate: null, messageId, deliveryIds };
    });
  } catch (err) {
    await removeObjects(env, messageId, written);
    throw err;
  }

  if (stored.duplicate) {
    await removeObjects(env, messageId, written);
    if (stored.duplicate.rawKey !== job.rawKey) await env.MAIL.delete(job.rawKey);
    return { outcome: "duplicate", messageId: stored.duplicate.id };
  }

  if (stored.deliveryIds.length > 0) {
    try {
      await env.WEBHOOKS.sendBatch(stored.deliveryIds.map((deliveryId) => ({ body: { workspaceId, deliveryId } })));
    } catch (err) {
      // The rows stay pending; the ClientDO alarm sweep re-enqueues them.
      console.error("inbound: webhook enqueue failed", stored.messageId, stored.deliveryIds.join(","), describeError(err));
    }
  }
  return { outcome: "inserted", messageId: stored.messageId, deliveries: stored.deliveryIds.length };
}
