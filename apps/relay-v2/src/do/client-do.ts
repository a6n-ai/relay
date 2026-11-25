import { DurableObject } from "cloudflare:workers";
import { and, eq, gte, inArray, isNull, lt, ne, or, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { brandDomain, campaignProblems, IMPLIED_CONSENT_MS, type CampaignProblem } from "../core/campaigns";
import { CHUNK_SIZE, ENQUEUE_BATCH } from "../core/campaign-workflow";
import { contactValues, fillUnsubscribe, hasMergeToken, MERGE_SAMPLES, renderMerge, type MergeData } from "../core/merge";
import { sesSendRate } from "../core/send-rate";
import type { SesSendRequest } from "../core/ses";
import { DEFAULT_MONTHLY_QUOTA, LIMITS_TTL_MS, loadWorkspaceLimits, SENDER_RETRY_MS, type WorkspaceLimits } from "../core/limits";
import { sendInputSchema, type SendInput, type Stream, type SuppressionReason } from "../core/send-input";
import type { SesEventJob } from "../core/ses-events";
import { listUnsubscribeHeaders, unsubscribeToken, unsubscribeUrl } from "../core/unsubscribe";
import { recordDoState } from "../core/workspace-profile";
import { utcDay } from "../core/usage";
import { decryptSecret, encryptSecret, KEY_ERROR, newWebhookSecret, signBody } from "../core/webhook-crypto";
import { webhookBody, webhookHeaders } from "../core/mailbox-received";
import { MAX_WEBHOOK_ATTEMPTS, webhookRetryDelaySeconds, type WebhookClaim, type WebhookOutcome } from "../core/webhook-consumer";
import { isPublicWebhookUrl, type WebhookInput, type WebhookPatch, type WebhookView } from "../core/webhooks";
import type { Env, InboundJob } from "../env";
import { newId } from "../lib/ids";
import {
  attachmentViews,
  type DeliveryView,
  getInboundFailureRow,
  listDeliveryRows,
  listInboundFailureRows,
  listMessageRows,
  listSuppressionRows,
  messagesByKeyRows,
  type MessageByKey,
  type FailureView,
  type SuppressionView,
  messageBody,
  readMessageDetail,
  readMessageFile,
  type MessageAccess,
  type MessageBody,
  type MessageFile,
  type MessageDetail,
  type MessageQuery,
  type MessageSummary,
} from "./console-reads";
import { storeInbound, writeInboundFailure, type InboundDeps, type InboundResult } from "./inbound";
import * as schema from "./client-schema";
import {
  bumpCampaign,
  type CampaignStats,
  campaignStatsRow,
  statsOf,
  createCampaignRow,
  deleteCampaignRow,
  getCampaignRow,
  listCampaignRows,
  previewAudienceRows,
  recipientQuery,
  updateCampaignRow,
  type AudiencePreview,
  type CampaignPatch,
  type CampaignSummary,
  type CampaignView,
} from "./campaigns";
import { CLIENT_MIGRATIONS, migrate } from "./migrations";
import {
  IMPORT_TX_ROWS,
  importCampaignRow,
  importInChunks,
  importListRow,
  importMessageRow,
  importTemplateRow,
  type ImportCampaignInput,
  type ImportIds,
  type ImportMessageRow,
  type ImportRow,
} from "./imports";
import {
  addMemberRow,
  createListRow,
  deleteListRow,
  listListRows,
  listMemberRows,
  exportMemberRows,
  IMPORT_CHUNK,
  importMemberRow,
  removeMemberRow,
  updateListRow,
  type ImportResult,
  type ListInput,
  type ListView,
  type MemberInput,
  type MemberView,
} from "./lists";
import { maskEmails } from "../core/mask-emails";
import {
  createTemplateRow,
  deleteTemplateRow,
  getTemplateRow,
  listTemplateRows,
  templateOverrideRows,
  updateTemplateRow,
  type TemplateInput,
  type RenderedTemplate,
  type TemplateOverride,
  type TemplateView,
} from "./templates";
import { deleteWebhookRow, failDeliveryRow, listWebhookRows, toWebhookView, updateWebhookRow, type WebhookRow } from "./webhooks";
import {
  audienceCallFor,
  audienceHookView,
  deleteAudienceHookRow,
  parseHookCursor,
  setAudienceHookRow,
  type AudienceHookInput,
  type AudienceHookView,
} from "./audience-hook";
import type { AudiencePage, HookCall } from "../core/audience-hook";
import {
  createAutomationRow,
  deleteAutomationRow,
  earliestDue,
  enrolAutomations,
  listAutomationRows,
  nextAutomationAlarm,
  runDueAutomationRows,
  setAutomationEnabledRow,
  updateAutomationRow,
  type AutomationInput,
  type AutomationPatch,
  type AutomationView,
} from "./automations";

export type AttachmentView = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
  position: number;
};

export type MessageView = typeof schema.message.$inferSelect & { html: string | null; attachments: AttachmentView[] };

export type SendResult = { messageId: string; status: "queued" | "sent" | "failed" | "suppressed"; duplicate: boolean };

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
    const preSuppressed = this.suppressed(data.to, data.stream, data.from);
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
        if (limits.monthlyQuota > 0 && this.monthUsed(now) >= limits.monthlyQuota) throw new Error("quota_exceeded");
        // Re-checked here: an unsubscribe can land during the R2 put above.
        suppressed = this.suppressed(data.to, data.stream, data.from);
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
      throw new Error("queue_failed", { cause: err });
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
    const body = messageBody(this.db, row);
    const object = row.htmlKey ? await this.env.MAIL.get(row.htmlKey) : null;
    return {
      ...row,
      html: body?.html ?? (object ? await object.text() : null),
      text: body?.text ?? row.text,
      attachments: attachmentViews(this.db, id),
    };
  }

  async listMessages(
    workspaceId: string,
    q: MessageQuery,
    access: MessageAccess,
  ): Promise<{ rows: MessageSummary[]; nextCursor: string | null }> {
    await this.ready(workspaceId);
    return listMessageRows(this.db, q, access);
  }

  async getMessageDetail(workspaceId: string, id: string, access: MessageAccess): Promise<MessageDetail | null> {
    await this.ready(workspaceId);
    return readMessageDetail(this.db, this.env, id, access);
  }

  async getMessageFile(
    workspaceId: string,
    id: string,
    part: string,
    access: MessageAccess,
  ): Promise<MessageFile | null> {
    await this.ready(workspaceId);
    return readMessageFile(this.db, id, part, access);
  }

  // The letter is already in R2 under job.rawKey. Idempotent on the raw key and on the app's Message-ID.
  async ingestInbound(workspaceId: string, job: InboundJob): Promise<InboundResult> {
    await this.ready(workspaceId);
    // Armed so the sweep re-enqueues any delivery whose enqueue below fails.
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
    return storeInbound(this.inboundDeps(), workspaceId, job);
  }

  async recordInboundFailure(workspaceId: string, job: InboundJob, error: string): Promise<void> {
    await this.ready(workspaceId);
    writeInboundFailure(this.inboundDeps(), workspaceId, job, error);
  }
  async listInboundFailures(workspaceId: string, inbound: "all" | string[]): Promise<FailureView[]> {
    await this.ready(workspaceId);
    return listInboundFailureRows(this.db, inbound);
  }
  // Server only: the console never returns rawKey or authResults.
  async getInboundFailure(workspaceId: string, id: string) {
    await this.ready(workspaceId);
    return getInboundFailureRow(this.db, id);
  }
  // The raw letter is removed only when no message still points at it.
  async deleteInboundFailure(workspaceId: string, id: string): Promise<boolean> {
    await this.ready(workspaceId);
    const removed = this.ctx.storage.transactionSync(() => {
      const row = this.db
        .select({ rawKey: schema.inboundFailure.rawKey })
        .from(schema.inboundFailure)
        .where(eq(schema.inboundFailure.id, id))
        .get();
      if (!row) return null;
      this.db.delete(schema.inboundFailure).where(eq(schema.inboundFailure.id, id)).run();
      const shared = this.db
        .select({ id: schema.message.id })
        .from(schema.message)
        .where(eq(schema.message.rawKey, row.rawKey))
        .get();
      return { rawKey: row.rawKey, shared: shared !== undefined };
    });
    if (!removed) return false;
    if (!removed.shared && removed.rawKey.startsWith(`ws/${workspaceId}/raw/`)) await this.env.MAIL.delete(removed.rawKey);
    return true;
  }

  private inboundDeps(): InboundDeps {
    return { storage: this.ctx.storage, db: this.db, env: this.env };
  }

  // The plaintext secret leaves here once; only its ciphertext is stored, bound to this webhook id by the AAD.
  async createWebhook(workspaceId: string, appId: string, input: WebhookInput): Promise<{ webhook: WebhookView; secret: string }> {
    await this.ready(workspaceId);
    const id = newId("whk");
    const secret = input.secret ?? newWebhookSecret();
    const now = Date.now();
    const row: WebhookRow = {
      id,
      appId,
      url: input.url,
      secretEnc: await encryptSecret(this.env.WEBHOOK_SECRET_KEY, secret, `${workspaceId}:${id}`),
      events: JSON.stringify(input.events),
      enabled: input.enabled === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    };
    this.ctx.storage.transactionSync(() => {
      this.db.insert(schema.webhook).values(row).run();
    });
    return { webhook: toWebhookView(row), secret };
  }

  async listWebhooks(workspaceId: string, appId: string): Promise<WebhookView[]> {
    await this.ready(workspaceId);
    return listWebhookRows(this.db, appId).map(toWebhookView);
  }

  async updateWebhook(workspaceId: string, appId: string, id: string, patch: WebhookPatch): Promise<WebhookView | null> {
    await this.ready(workspaceId);
    const row = this.ctx.storage.transactionSync(() =>
      updateWebhookRow(this.db, appId, id, {
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.events !== undefined ? { events: JSON.stringify(patch.events) } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled ? 1 : 0 } : {}),
        updatedAt: Date.now(),
      }),
    );
    return row ? toWebhookView(row) : null;
  }

  async deleteWebhook(workspaceId: string, appId: string, id: string): Promise<boolean> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => deleteWebhookRow(this.db, appId, id));
  }

  async createList(workspaceId: string, appId: string, input: ListInput): Promise<ListView> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => createListRow(this.ctx.storage.sql, appId, input));
  }

  // shortcut: unpaged and counts every member in one join; paginate and count per page once lists grow past a screen.
  async listLists(workspaceId: string, appId?: string): Promise<ListView[]> {
    await this.ready(workspaceId);
    return listListRows(this.ctx.storage.sql, appId);
  }

  async updateList(workspaceId: string, id: string, patch: Partial<ListInput>): Promise<ListView | null> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => updateListRow(this.ctx.storage.sql, id, patch));
  }

  async deleteList(workspaceId: string, id: string): Promise<"deleted" | "missing" | "in_use"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => deleteListRow(this.ctx.storage.sql, id));
  }

  async listMembers(workspaceId: string, listId: string, cursor?: string): Promise<{ rows: MemberView[]; nextCursor: string | null } | null> {
    await this.ready(workspaceId);
    return listMemberRows(this.ctx.storage.sql, listId, (email) => this.suppressed(email, "marketing"), cursor);
  }

  async addMember(workspaceId: string, listId: string, input: MemberInput): Promise<"added" | "existing" | "suppressed" | "missing"> {
    await this.ready(workspaceId);
    const outcome = this.ctx.storage.transactionSync(() => {
      const result = addMemberRow(this.ctx.storage.sql, listId, input, (email) => this.suppressed(email, "marketing"));
      if (result === "added") enrolAutomations(this.ctx.storage.sql, listId, input.email.trim().toLowerCase(), Date.now());
      return result;
    });
    if (outcome === "added") await this.scheduleAlarmAt(earliestDue(this.ctx.storage.sql));
    return outcome;
  }

  async importMembers(workspaceId: string, listId: string, rows: MemberInput[]): Promise<ImportResult | null> {
    await this.ready(workspaceId);
    const sql = this.ctx.storage.sql;
    const list = sql.exec<{ app_id: string }>("SELECT app_id FROM contact_list WHERE id = ?", listId).toArray()[0];
    if (!list) return null;
    const total: ImportResult = { added: 0, existing: 0, suppressed: 0 };
    for (let start = 0; start < rows.length; start += IMPORT_CHUNK) {
      this.ctx.storage.transactionSync(() => {
        for (const row of rows.slice(start, start + IMPORT_CHUNK)) {
          const outcome = importMemberRow(sql, listId, list.app_id, row, (email) => this.suppressed(email, "marketing"));
          if (outcome === "added") enrolAutomations(sql, listId, row.email.trim().toLowerCase(), Date.now());
          total[outcome] += 1;
        }
      });
    }
    if (total.added > 0) await this.scheduleAlarmAt(earliestDue(sql));
    return total;
  }

  async removeMember(workspaceId: string, listId: string, memberId: string): Promise<boolean> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => removeMemberRow(this.ctx.storage.sql, listId, memberId));
  }
  async createCampaign(workspaceId: string, appId: string, name: string, templateId?: string): Promise<CampaignView | "template_missing"> {
    await this.ready(workspaceId);
    const view = this.ctx.storage.transactionSync(() => createCampaignRow(this.ctx.storage.sql, appId, name, templateId));
    return view === "missing" ? "template_missing" : view;
  }
  async listCampaigns(workspaceId: string, cursor?: string, appId?: string): Promise<{ rows: CampaignSummary[]; nextCursor: string | null }> {
    await this.ready(workspaceId);
    return listCampaignRows(this.ctx.storage.sql, cursor, appId);
  }
  async getCampaign(workspaceId: string, id: string): Promise<CampaignView | null> {
    await this.ready(workspaceId);
    return getCampaignRow(this.ctx.storage.sql, id);
  }
  async campaignStats(workspaceId: string, id: string): Promise<CampaignStats | null> {
    await this.ready(workspaceId);
    return campaignStatsRow(this.ctx.storage.sql, id);
  }
  // Admin and test helper, no console route: rebuilds the counters from messages and events, and returns both sets.
  async recountCampaign(workspaceId: string, id: string): Promise<{ before: CampaignStats; after: CampaignStats } | null> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      const before = campaignStatsRow(sql, id);
      if (!before) return null;
      const byStatus = sql
        .exec<{ status: string; n: number; opened: number; clicked: number; unsubscribed: number }>(
          "SELECT status, count(*) AS n, sum(opens > 0) AS opened, sum(clicks > 0) AS clicked, sum(unsubscribed_at IS NOT NULL) AS unsubscribed FROM message WHERE campaign_id = ? GROUP BY status",
          id,
        )
        .toArray();
      const events = sql
        .exec<{ type: string; n: number }>(
          "SELECT e.type AS type, count(DISTINCT e.message_id) AS n FROM message_event e JOIN message m ON m.id = e.message_id WHERE m.campaign_id = ? AND e.type IN ('Delivery', 'Bounce', 'Complaint') GROUP BY e.type",
          id,
        )
        .toArray();
      const counts = { queued: 0, sent: 0, failed: 0, suppressed: 0 };
      for (const r of byStatus) if (r.status in counts) counts[r.status as keyof typeof counts] += r.n;
      const sumOf = (k: "opened" | "clicked" | "unsubscribed") => byStatus.reduce((t, r) => t + (r[k] ?? 0), 0);
      const eventCount = (type: string) => events.find((e) => e.type === type)?.n ?? 0;
      const afterRow = {
        ...counts,
        delivered: eventCount("Delivery"),
        opened: sumOf("opened"),
        clicked: sumOf("clicked"),
        bounced: eventCount("Bounce"),
        complained: eventCount("Complaint"),
        unsubscribed: sumOf("unsubscribed"),
      };
      sql.exec(
        "UPDATE campaign SET queued = ?, sent = ?, failed = ?, suppressed = ?, delivered = ?, opened = ?, clicked = ?, bounced = ?, complained = ?, unsubscribed = ? WHERE id = ?",
        afterRow.queued,
        afterRow.sent,
        afterRow.failed,
        afterRow.suppressed,
        afterRow.delivered,
        afterRow.opened,
        afterRow.clicked,
        afterRow.bounced,
        afterRow.complained,
        afterRow.unsubscribed,
        id,
      );
      return { before, after: statsOf(afterRow) };
    });
  }
  async updateCampaign(workspaceId: string, id: string, patch: CampaignPatch): Promise<CampaignView | "missing" | "not_draft" | "bad_list"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => updateCampaignRow(this.ctx.storage.sql, id, patch));
  }
  async deleteCampaign(workspaceId: string, id: string): Promise<"deleted" | "missing" | "not_draft"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => deleteCampaignRow(this.ctx.storage.sql, id));
  }
  async createTemplate(workspaceId: string, appId: string, input: TemplateInput): Promise<TemplateView | "event_taken"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => createTemplateRow(this.ctx.storage.sql, appId, input));
  }
  async listTemplates(workspaceId: string, appId?: string, cursor?: string): Promise<{ rows: TemplateView[]; nextCursor: string | null }> {
    await this.ready(workspaceId);
    return listTemplateRows(this.ctx.storage.sql, cursor, appId);
  }
  async getTemplate(workspaceId: string, id: string): Promise<TemplateView | null> {
    await this.ready(workspaceId);
    return getTemplateRow(this.ctx.storage.sql, id);
  }
  async updateTemplate(workspaceId: string, id: string, patch: Partial<TemplateInput>): Promise<TemplateView | "missing" | "event_taken"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => updateTemplateRow(this.ctx.storage.sql, id, patch));
  }
  async deleteTemplate(workspaceId: string, id: string): Promise<"deleted" | "missing" | "in_use"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => deleteTemplateRow(this.ctx.storage.sql, id));
  }
  async templateOverrides(workspaceId: string, appId: string): Promise<TemplateOverride[]> {
    await this.ready(workspaceId);
    return templateOverrideRows(this.ctx.storage.sql, appId);
  }
  // Postal address is snapshotted here: a later Settings change does not alter a scheduled campaign.
  async scheduleCampaign(
    workspaceId: string,
    id: string,
    at: number,
    postalAddress: string | null,
  ): Promise<{ runSeq: number } | { problems: CampaignProblem[] } | "missing" | "not_draft"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync((): { runSeq: number } | { problems: CampaignProblem[] } | "missing" | "not_draft" => {
      const row = getCampaignRow(this.ctx.storage.sql, id);
      if (!row) return "missing";
      if (row.status !== "draft") return "not_draft";
      const hookReady = this.ctx.storage.sql.exec("SELECT 1 FROM audience_hook WHERE app_id = ? AND enabled = 1", row.appId).toArray().length > 0;
      const problems = campaignProblems({ ...row, hookReady }, postalAddress);
      if (problems.length > 0) return { problems };
      const runSeq = row.runSeq + 1;
      this.ctx.storage.sql.exec(
        "UPDATE campaign SET status = 'scheduled', scheduled_at = ?, run_seq = ?, postal_address = ?, cursor = NULL, recipients = 0, error = NULL, updated_at = ? WHERE id = ?",
        at,
        runSeq,
        postalAddress,
        Date.now(),
        id,
      );
      return { runSeq };
    });
  }
  async unscheduleCampaign(workspaceId: string, id: string): Promise<"draft" | "missing" | "not_scheduled"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync((): "draft" | "missing" | "not_scheduled" => {
      const head = this.campaignHead(id);
      if (!head) return "missing";
      if (head.status !== "scheduled") return "not_scheduled";
      this.ctx.storage.sql.exec("UPDATE campaign SET status = 'draft', scheduled_at = NULL, updated_at = ? WHERE id = ?", Date.now(), id);
      return "draft";
    });
  }
  // Retries of the start step land here with status already sending, so they return go too.
  // A hook campaign also returns the page it resumes from; a list campaign returns "go" as before.
  async startCampaign(workspaceId: string, id: string, runSeq: number, now = Date.now()): Promise<"go" | "stale" | { go: "go"; page: number }> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync((): "go" | "stale" | { go: "go"; page: number } => {
      const head = this.campaignHead(id);
      if (!head || head.runSeq !== runSeq) return "stale";
      if (head.status !== "sending" && head.status !== "scheduled") return "stale";
      if (head.status === "scheduled") {
        this.ctx.storage.sql.exec("UPDATE campaign SET status = 'sending', started_at = coalesce(started_at, ?), updated_at = ? WHERE id = ?", now, now, id);
      }
      const row = this.ctx.storage.sql
        .exec<{ audienceKind: string; cursor: string | null }>("SELECT audience_kind AS audienceKind, cursor FROM campaign WHERE id = ?", id)
        .one();
      return row.audienceKind === "hook" ? { go: "go", page: parseHookCursor(row.cursor).p } : "go";
    });
  }
  // One sub-chunk is one transactionSync of inserts, then one sendBatch. The cursor moves only after the batch succeeds,
  // so a retried chunk resumes at the same recipient and finds the rows it already inserted by key.
  async campaignChunk(
    workspaceId: string,
    id: string,
    runSeq: number,
    now = Date.now(),
  ): Promise<{ state: "more" | "done" | "stopped"; enqueued: number; paceMs: number }> {
    await this.ready(workspaceId);
    const sql = this.ctx.storage.sql;
    let enqueued = 0;
    const stopped = () => ({ state: "stopped" as const, enqueued, paceMs: 0 });
    const live = () => {
      const head = this.campaignHead(id);
      return head !== undefined && head.status === "sending" && head.runSeq === runSeq;
    };
    const setPaused = (error: string) =>
      sql.exec("UPDATE campaign SET status = 'paused', error = ?, updated_at = ? WHERE id = ? AND status = 'sending' AND run_seq = ?", error, now, id, runSeq);
    if (!live()) return stopped();
    const campaign = sql
      .exec<{ appId: string; fromEmail: string | null; subject: string; listIds: string; postalAddress: string | null; cursor: string | null }>(
        "SELECT app_id AS appId, from_email AS fromEmail, subject, list_ids AS listIds, postal_address AS postalAddress, cursor FROM campaign WHERE id = ?",
        id,
      )
      .one();
    const limits = await this.limits(workspaceId, { forSender: campaign.fromEmail ?? undefined });
    // No snapshot yet: throw so the Workflow step retries. A missing snapshot must not look like a revoked sender.
    if (limits.fetchedAt === 0) throw new Error("limits unavailable");
    if (limits.status === "suspended") {
      this.ctx.storage.transactionSync(() => setPaused("workspace_suspended"));
      return stopped();
    }
    const sender = limits.senders[campaign.fromEmail ?? ""];
    if (!sender) {
      this.ctx.storage.transactionSync(() => setPaused("sender_not_verified"));
      return stopped();
    }
    const rate = sesSendRate(this.env, sender.sesRegion);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    let cursor = campaign.cursor ?? "";
    for (let sub = 0; sub < CHUNK_SIZE / ENQUEUE_BATCH; sub++) {
      if (!live()) return stopped();
      const rows = sql
        .exec<{ email: string; firstName: string | null; lastName: string | null }>(
          `SELECT email, firstName, lastName FROM (${recipientQuery()}) WHERE email > ? ORDER BY email LIMIT ?`,
          campaign.appId,
          campaign.listIds,
          now - IMPLIED_CONSENT_MS,
          cursor,
          ENQUEUE_BATCH,
        )
        .toArray();
      if (rows.length === 0) {
        this.ctx.storage.transactionSync(() =>
          sql.exec("UPDATE campaign SET status = 'sent', finished_at = ?, updated_at = ? WHERE id = ? AND run_seq = ?", now, now, id, runSeq),
        );
        return { state: "done", enqueued, paceMs: 0 };
      }
      const batch = await this.enqueueRecipients(
        { workspaceId, id, runSeq, appId: campaign.appId, fromEmail: campaign.fromEmail, subject: campaign.subject, postalAddress: campaign.postalAddress, cursor, limits, sender, rate, now, offset: enqueued },
        rows.map((r) => ({ email: r.email, firstName: r.firstName, lastName: r.lastName })),
      );
      // Runs even if a pause landed during sendBatch: the rows are enqueued, so the cursor must cover them.
      if (batch.handled > 0) {
        this.ctx.storage.transactionSync(() =>
          sql.exec("UPDATE campaign SET cursor = ?, recipients = recipients + ?, updated_at = ? WHERE id = ? AND run_seq = ?", batch.lastEmail, batch.handled, now, id, runSeq),
        );
        cursor = batch.lastEmail;
      }
      enqueued += batch.queued;
      const quotaHit = batch.quotaHit;
      if (quotaHit) {
        this.ctx.storage.transactionSync(() => setPaused("quota_exceeded"));
        return stopped();
      }
    }
    return { state: "more", enqueued, paceMs: Math.ceil(enqueued / rate) * 1000 };
  }
  async pauseCampaign(workspaceId: string, id: string, error: string | null = null, runSeq?: number): Promise<"paused" | "missing" | "not_sending"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync((): "paused" | "missing" | "not_sending" => {
      const head = this.campaignHead(id);
      if (!head) return "missing";
      if (head.status !== "sending" || (runSeq !== undefined && head.runSeq !== runSeq)) return "not_sending";
      this.ctx.storage.sql.exec(
        "UPDATE campaign SET status = 'paused', error = ?, updated_at = ? WHERE id = ? AND status = 'sending' AND run_seq = ?",
        error,
        Date.now(),
        id,
        head.runSeq,
      );
      return "paused";
    });
  }
  async resumeCampaign(workspaceId: string, id: string): Promise<{ runSeq: number } | "missing" | "not_paused"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync((): { runSeq: number } | "missing" | "not_paused" => {
      const head = this.campaignHead(id);
      if (!head) return "missing";
      if (head.status !== "paused") return "not_paused";
      const runSeq = head.runSeq + 1;
      this.ctx.storage.sql.exec("UPDATE campaign SET status = 'sending', run_seq = ?, error = NULL, updated_at = ? WHERE id = ?", runSeq, Date.now(), id);
      return { runSeq };
    });
  }
  // Queued rows nobody has claimed fail here. Rows already claimed or handed to SES are left to finish.
  async cancelCampaign(workspaceId: string, id: string, now = Date.now()): Promise<{ dropped: number } | "missing" | "not_cancellable"> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync((): { dropped: number } | "missing" | "not_cancellable" => {
      const head = this.campaignHead(id);
      if (!head) return "missing";
      if (!["scheduled", "sending", "paused"].includes(head.status)) return "not_cancellable";
      this.ctx.storage.sql.exec("UPDATE campaign SET status = 'cancelled', finished_at = ?, updated_at = ? WHERE id = ?", now, now, id);
      const dropped = this.db
        .update(schema.message)
        .set({ status: "failed", error: "campaign_cancelled", claimedUntil: null, updatedAt: now })
        .where(
          and(
            eq(schema.message.campaignId, id),
            eq(schema.message.status, "queued"),
            isNull(schema.message.sesMessageId),
            or(isNull(schema.message.claimedUntil), lt(schema.message.claimedUntil, now)),
          ),
        )
        .returning({ id: schema.message.id })
        .all().length;
      bumpCampaign(this.ctx.storage.sql, id, { queued: -dropped, failed: dropped });
      return { dropped };
    });
  }
  // Sent through the normal send path with the signed-in user's own address. No campaign id, so no counters move.
  async testSendCampaign(workspaceId: string, id: string, to: string, postalAddress: string | null): Promise<SendResult | "missing"> {
    await this.ready(workspaceId);
    const c = getCampaignRow(this.ctx.storage.sql, id);
    if (!c) return "missing";
    if (!c.fromEmail) throw new Error("sender_not_verified");
    const values = { ...MERGE_SAMPLES, "contact.email": to, postal_address: postalAddress ?? MERGE_SAMPLES.postal_address };
    return this.send(workspaceId, {
      appId: c.appId,
      stream: "marketing",
      from: c.fromEmail,
      to,
      subject: `[Test] ${renderMerge(c.subject, values, "subject")}`,
      html: renderMerge(c.html, values, "html"),
      text: renderMerge(c.text, values, "text"),
    });
  }
  async previewAudience(
    workspaceId: string,
    appId: string,
    listIds: string[],
    fromEmail: string | null,
    now = Date.now(),
  ): Promise<AudiencePreview> {
    await this.ready(workspaceId);
    return previewAudienceRows(this.ctx.storage.sql, appId, listIds, fromEmail, (email) => this.suppressed(email, "marketing"), now);
  }

  async listWebhookDeliveries(
    workspaceId: string,
    appId: string,
    webhookId: string,
    visible: "all" | string[],
    cursor?: string,
  ): Promise<{ rows: DeliveryView[]; nextCursor: string | null }> {
    await this.ready(workspaceId);
    return listDeliveryRows(this.db, { appId, webhookId, cursor, visible });
  }

  // Only a failed row can be retried. Failed rows hold no lease, so no send is in flight to race.
  async retryWebhookDelivery(
    workspaceId: string,
    appId: string,
    deliveryId: string,
    now = Date.now(),
  ): Promise<"queued" | "missing" | "not_failed" | "webhook_disabled"> {
    await this.ready(workspaceId);
    const outcome = this.ctx.storage.transactionSync((): "queued" | "missing" | "not_failed" | "webhook_disabled" => {
      const row = this.db
        .select()
        .from(schema.webhookDelivery)
        .where(and(eq(schema.webhookDelivery.id, deliveryId), eq(schema.webhookDelivery.appId, appId)))
        .get();
      if (!row) return "missing";
      if (row.status !== "failed") return "not_failed";
      const hook = this.db
        .select({ enabled: schema.webhook.enabled })
        .from(schema.webhook)
        .where(and(eq(schema.webhook.id, row.webhookId), eq(schema.webhook.appId, appId)))
        .get();
      if (!hook || hook.enabled !== 1) return "webhook_disabled";
      this.db
        .update(schema.webhookDelivery)
        .set({
          status: "pending",
          attempts: 0,
          nextAttemptAt: now,
          claimedUntil: null,
          lastError: null,
          responseStatus: null,
          retriedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.webhookDelivery.id, deliveryId))
        .run();
      return "queued";
    });
    if (outcome !== "queued") return outcome;
    // Armed so the sweep covers a failed enqueue below, as ingestInbound does.
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    try {
      await this.env.WEBHOOKS.send({ workspaceId, deliveryId });
    } catch (err) {
      console.error("ClientDO: webhook retry enqueue failed", deliveryId, err instanceof Error ? err.name : "unknown");
    }
    return outcome;
  }

  // The secret is decrypted here and only its HMAC signature leaves, inside the returned headers.
  async claimWebhookDelivery(workspaceId: string, deliveryId: string, now = Date.now()): Promise<WebhookClaim> {
    await this.ready(workspaceId);
    const row = this.db.select().from(schema.webhookDelivery).where(eq(schema.webhookDelivery.id, deliveryId)).get();
    if (!row || row.status !== "pending") return { kind: "skip" };
    if (row.claimedUntil != null && row.claimedUntil > now) {
      return { kind: "busy", retryInSeconds: Math.ceil((row.claimedUntil - now) / 1000) };
    }
    const hook = this.db.select().from(schema.webhook).where(eq(schema.webhook.id, row.webhookId)).get();
    if (!hook || hook.enabled !== 1 || !(JSON.parse(hook.events) as string[]).includes(row.event)) {
      this.failDelivery(deliveryId, "Webhook missing or disabled", now);
      return { kind: "skip" };
    }
    // Re-checked per delivery: a stored URL may predate a rule change.
    if (!isPublicWebhookUrl(hook.url)) {
      this.failDelivery(deliveryId, "URL not public", now);
      return { kind: "skip" };
    }
    const payload = await this.env.MAIL.get(row.payloadKey);
    if (!payload) {
      this.failDelivery(deliveryId, "Payload missing", now);
      return { kind: "skip" };
    }
    let secret: string;
    try {
      secret = await decryptSecret(this.env.WEBHOOK_SECRET_KEY, hook.secretEnc, `${workspaceId}:${hook.id}`);
    } catch (err) {
      // A missing key is a config problem: throw so the consumer retries without spending an attempt.
      if (err instanceof Error && err.message === KEY_ERROR) throw err;
      this.failDelivery(deliveryId, "Secret unreadable", now);
      return { kind: "skip" };
    }
    const body = webhookBody(row.id, row.event, row.createdAt, await payload.text());
    const headers = webhookHeaders(row.event, await signBody(secret, body));

    // Re-read inside the transaction: a concurrent claim may have taken the lease while the reads above awaited.
    return this.ctx.storage.transactionSync((): WebhookClaim => {
      const current = this.db.select().from(schema.webhookDelivery).where(eq(schema.webhookDelivery.id, deliveryId)).get();
      if (!current || current.status !== "pending") return { kind: "skip" };
      if (current.claimedUntil != null && current.claimedUntil > now) {
        return { kind: "busy", retryInSeconds: Math.ceil((current.claimedUntil - now) / 1000) };
      }
      const attempt = current.attempts + 1;
      this.db
        .update(schema.webhookDelivery)
        .set({ claimedUntil: now + CLAIM_LEASE_MS, attempts: attempt, updatedAt: now })
        .where(eq(schema.webhookDelivery.id, deliveryId))
        .run();
      return { kind: "deliver", attempt, url: hook.url, body, headers };
    });
  }

  // Returns the delay before the next attempt, or null when the delivery is finished (sent or failed for good).
  async markWebhookDelivery(
    workspaceId: string,
    deliveryId: string,
    outcome: WebhookOutcome,
    now = Date.now(),
  ): Promise<{ retryInSeconds: number | null }> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => {
      const row = this.db.select().from(schema.webhookDelivery).where(eq(schema.webhookDelivery.id, deliveryId)).get();
      if (!row) return { retryInSeconds: null };
      const responseStatus = outcome.status ?? null;
      if (outcome.ok) {
        this.db
          .update(schema.webhookDelivery)
          .set({ status: "sent", responseStatus, lastError: null, claimedUntil: null, updatedAt: now })
          .where(eq(schema.webhookDelivery.id, deliveryId))
          .run();
        return { retryInSeconds: null };
      }
      if (row.attempts < MAX_WEBHOOK_ATTEMPTS) {
        const retryInSeconds = webhookRetryDelaySeconds(row.attempts);
        this.db
          .update(schema.webhookDelivery)
          .set({
            lastError: outcome.error,
            responseStatus,
            nextAttemptAt: now + retryInSeconds * 1000,
            claimedUntil: null,
            updatedAt: now,
          })
          .where(eq(schema.webhookDelivery.id, deliveryId))
          .run();
        return { retryInSeconds };
      }
      this.db
        .update(schema.webhookDelivery)
        .set({ status: "failed", lastError: outcome.error, responseStatus, claimedUntil: null, updatedAt: now })
        .where(eq(schema.webhookDelivery.id, deliveryId))
        .run();
      return { retryInSeconds: null };
    });
  }

  private failDelivery(deliveryId: string, error: string, now: number): void {
    this.ctx.storage.transactionSync(() => failDeliveryRow(this.db, deliveryId, error, now));
  }

  // A lease (claimed_until) stops a second job from sending while the first is in flight.
  async claimSend(workspaceId: string, messageId: string, now = Date.now()): Promise<SendClaim> {
    await this.ready(workspaceId);
    const queued = this.db
      .select({
        fromEmail: schema.message.fromEmail,
        stream: schema.message.stream,
        status: schema.message.status,
        sesMessageId: schema.message.sesMessageId,
        claimedUntil: schema.message.claimedUntil,
      })
      .from(schema.message)
      .where(eq(schema.message.id, messageId))
      .get();
    if (!queued) return { kind: "skip", reason: "missing" };
    if (queued.status !== "queued" || queued.sesMessageId) {
      return { kind: "skip", reason: queued.status === "queued" ? "sent" : (queued.status as "sent" | "failed" | "suppressed") };
    }
    if (queued.claimedUntil != null && queued.claimedUntil > now) {
      return { kind: "busy", retryInSeconds: Math.ceil((queued.claimedUntil - now) / 1000) };
    }
    // Only a row about to be sent needs limits. Read before the transaction. With no snapshot and no D1, the job retries: queued mail is never failed for an outage.
    const limits = await this.limits(workspaceId, { forSender: queued.fromEmail ?? undefined });
    if (limits.fetchedAt === 0) return { kind: "busy", retryInSeconds: 60 };
    // Minted before the claim transaction: a missing secret throws here, so attempts never moves.
    const url = queued.stream === "marketing" ? unsubscribeUrl(this.env.BETTER_AUTH_URL, await unsubscribeToken(this.env.UNSUBSCRIBE_SECRET, workspaceId, messageId)) : null;
    const fill = (s: string) => (url ? fillUnsubscribe(s, url) : s);
    const claimed = this.ctx.storage.transactionSync(():
      | SendClaim
      | { kind: "claimed"; attempt: number; row: typeof schema.message.$inferSelect; region: string; body: MessageBody | null }
      | { kind: "suppressed"; htmlKey: string | null }
      | { kind: "refused"; htmlKey: string | null } => {
      const row = this.db.select().from(schema.message).where(eq(schema.message.id, messageId)).get();
      if (!row) return { kind: "skip", reason: "missing" };
      if (row.status !== "queued" || row.sesMessageId) {
        return { kind: "skip", reason: row.status === "queued" ? "sent" : (row.status as "sent" | "failed" | "suppressed") };
      }
      if (row.claimedUntil != null && row.claimedUntil > now) {
        return { kind: "busy", retryInSeconds: Math.ceil((row.claimedUntil - now) / 1000) };
      }
      // Re-checked at claim time: a bounce or complaint can land while the row waits in the queue.
      if (this.suppressed(row.toEmail ?? "", row.stream as Stream, row.fromEmail)) {
        this.db
          .update(schema.message)
          .set({ status: "suppressed", htmlKey: null, claimedUntil: null, updatedAt: now })
          .where(eq(schema.message.id, messageId))
          .run();
        bumpCampaign(this.ctx.storage.sql, row.campaignId, { queued: -1, suppressed: 1 });
        return { kind: "suppressed", htmlKey: row.htmlKey };
      }
      // A suspension or a revoked sender can land while the row waits in the queue; the message fails, it is not held.
      if (limits.status === "suspended" || !limits.senders[row.fromEmail ?? ""]) {
        this.db
          .update(schema.message)
          .set({
            status: "failed",
            error: limits.status === "suspended" ? "workspace_suspended" : "sender_not_verified",
            htmlKey: null,
            claimedUntil: null,
            updatedAt: now,
          })
          .where(eq(schema.message.id, messageId))
          .run();
        bumpCampaign(this.ctx.storage.sql, row.campaignId, { queued: -1, failed: 1 });
        return { kind: "refused", htmlKey: row.htmlKey };
      }
      let body: MessageBody | null = null;
      if (row.campaignId) {
        const content = getCampaignRow(this.ctx.storage.sql, row.campaignId);
        body = messageBody(this.db, row);
        const error = !content
          ? "template missing"
          : !content.html && !content.text
            ? "campaign content missing"
            : !body
              ? "template missing"
              : null;
        if (error) {
          this.db
            .update(schema.message)
            .set({ status: "failed", error, claimedUntil: null, updatedAt: now })
            .where(eq(schema.message.id, messageId))
            .run();
          bumpCampaign(this.ctx.storage.sql, row.campaignId, { queued: -1, failed: 1 });
          return { kind: "skip", reason: "failed" };
        }
      }
      const region = row.sesRegion;
      if (!region) {
        this.db
          .update(schema.message)
          .set({ status: "failed", error: "no SES region", claimedUntil: null, updatedAt: now })
          .where(eq(schema.message.id, messageId))
          .run();
        bumpCampaign(this.ctx.storage.sql, row.campaignId, { queued: -1, failed: 1 });
        return { kind: "skip", reason: "failed" };
      }
      const attempt = row.attempts + 1;
      this.db
        .update(schema.message)
        .set({ claimedUntil: now + CLAIM_LEASE_MS, attempts: attempt, updatedAt: now })
        .where(eq(schema.message.id, messageId))
        .run();
      return { kind: "claimed", attempt, row, region, body };
    });
    if (claimed.kind === "suppressed") {
      await this.dropHtml(claimed.htmlKey);
      return { kind: "skip", reason: "suppressed" };
    }
    if (claimed.kind === "refused") {
      await this.dropHtml(claimed.htmlKey);
      return { kind: "skip", reason: "failed" };
    }
    if (claimed.kind !== "claimed") return claimed;

    const { row, attempt, region, body } = claimed;
    const object = row.htmlKey ? await this.env.MAIL.get(row.htmlKey) : null;
    if (row.htmlKey && !object) {
      this.ctx.storage.transactionSync(() => {
        const changed = this.db
          .update(schema.message)
          .set({ status: "failed", error: "html missing", claimedUntil: null, updatedAt: Date.now() })
          .where(and(eq(schema.message.id, messageId), eq(schema.message.status, "queued")))
          .returning({ id: schema.message.id })
          .all();
        if (changed.length) bumpCampaign(this.ctx.storage.sql, row.campaignId, { queued: -1, failed: 1 });
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
        html: body ? fill(body.html) : object ? fill(await object.text()) : null,
        text: body ? fill(body.text) : fill(row.text ?? ""),
        tags: { ws: workspaceId, msg: messageId },
        ...(url ? { headers: listUnsubscribeHeaders(url) } : {}),
      },
    };
  }

  // SES accepted the message. Idempotent; a failed row is overwritten because SES has the message.
  // Returns true only when this call changed the row, so the caller counts each send once.
  async markSent(workspaceId: string, messageId: string, sesMessageId: string, now = Date.now()): Promise<boolean> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => {
      const prior = this.db
        .select({ status: schema.message.status, campaignId: schema.message.campaignId })
        .from(schema.message)
        .where(eq(schema.message.id, messageId))
        .get();
      if (!prior || prior.status === "sent") return false;
      this.db
        .update(schema.message)
        .set({ status: "sent", sesMessageId, sentAt: now, claimedUntil: null, error: null, updatedAt: now })
        .where(and(eq(schema.message.id, messageId), ne(schema.message.status, "sent")))
        .run();
      bumpCampaign(this.ctx.storage.sql, prior.campaignId, { sent: 1, [prior.status]: -1 });
      return true;
    });
  }

  async markSendFailed(workspaceId: string, messageId: string, error: string, final: boolean): Promise<void> {
    await this.ready(workspaceId);
    this.ctx.storage.transactionSync(() => {
      // Only a queued row is repainted: a claim that lost its lease may find the row already suppressed, sent or failed.
      const changed = this.db
        .update(schema.message)
        .set({ error: maskEmails(error), claimedUntil: null, updatedAt: Date.now(), ...(final ? { status: "failed" as const } : {}) })
        .where(and(eq(schema.message.id, messageId), eq(schema.message.status, "queued")))
        .returning({ campaignId: schema.message.campaignId })
        .all();
      if (final && changed.length) bumpCampaign(this.ctx.storage.sql, changed[0].campaignId, { queued: -1, failed: 1 });
    });
  }

  async addSuppression(workspaceId: string, email: string, reason: SuppressionReason, stream?: Stream): Promise<{ created: boolean }> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => {
      const key = email.trim().toLowerCase();
      const had = this.db.select({ email: schema.suppression.email }).from(schema.suppression).where(eq(schema.suppression.email, key)).get() !== undefined;
      this.writeSuppression(key, reason, stream);
      return { created: !had };
    });
  }

  async messagesByKeys(workspaceId: string, appId: string, keys: string[]): Promise<MessageByKey[]> {
    await this.ready(workspaceId);
    return messagesByKeyRows(this.db, appId, keys);
  }

  async suppressionRows(workspaceId: string, emails: string[]): Promise<{ email: string; stream: Stream | null; reason: SuppressionReason }[]> {
    await this.ready(workspaceId);
    return this.db
      .select({ email: schema.suppression.email, stream: schema.suppression.stream, reason: schema.suppression.reason })
      .from(schema.suppression)
      .where(sql`${schema.suppression.email} IN (SELECT value FROM json_each(${JSON.stringify(emails)}))`)
      .all() as { email: string; stream: Stream | null; reason: SuppressionReason }[];
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
      .select({
        sesMessageId: schema.message.sesMessageId,
        campaignId: schema.message.campaignId,
        opens: schema.message.opens,
        clicks: schema.message.clicks,
      })
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
    // Campaign counters move on the first event of each type for the message, not on every replay.
    const firstOf = (type: "Delivery" | "Bounce" | "Complaint") =>
      !this.db
        .select({ id: schema.messageEvent.id })
        .from(schema.messageEvent)
        .where(
          and(
            eq(schema.messageEvent.messageId, job.messageId),
            eq(schema.messageEvent.type, type),
            ne(schema.messageEvent.id, inserted[0].id),
          ),
        )
        .limit(1)
        .get();
    const usage = { delivered: 0, bounced: 0 };
    switch (job.type) {
      case "Open":
        this.db
          .update(schema.message)
          .set({ opens: sql`${schema.message.opens} + 1` })
          .where(eq(schema.message.id, job.messageId))
          .run();
        if (row.opens === 0) bumpCampaign(this.ctx.storage.sql, row.campaignId, { opened: 1 });
        break;
      case "Click":
        this.db
          .update(schema.message)
          .set({ clicks: sql`${schema.message.clicks} + 1` })
          .where(eq(schema.message.id, job.messageId))
          .run();
        if (row.clicks === 0) bumpCampaign(this.ctx.storage.sql, row.campaignId, { clicked: 1 });
        break;
      case "Delivery":
        usage.delivered = 1;
        if (firstOf("Delivery")) bumpCampaign(this.ctx.storage.sql, row.campaignId, { delivered: 1 });
        break;
      case "Bounce":
        usage.bounced = 1;
        if (firstOf("Bounce")) bumpCampaign(this.ctx.storage.sql, row.campaignId, { bounced: 1 });
        if (job.bounceType === "Permanent") for (const r of job.recipients) this.writeSuppression(r, "bounce");
        break;
      case "Complaint":
        if (firstOf("Complaint")) bumpCampaign(this.ctx.storage.sql, row.campaignId, { complained: 1 });
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

  async isSuppressed(workspaceId: string, email: string, stream: Stream, from?: string): Promise<boolean> {
    await this.ready(workspaceId);
    return this.suppressed(email.trim().toLowerCase(), stream, from ?? null);
  }

  async importLists(workspaceId: string, appId: string, rows: ImportRow<ListInput>[]): Promise<ImportIds> {
    await this.ready(workspaceId);
    return importInChunks(this.ctx.storage, rows, (row) => importListRow(this.ctx.storage.sql, appId, row));
  }

  async importTemplates(workspaceId: string, appId: string, rows: ImportRow<TemplateInput>[]): Promise<ImportIds> {
    await this.ready(workspaceId);
    return importInChunks(this.ctx.storage, rows, (row) => importTemplateRow(this.ctx.storage.sql, appId, row));
  }

  async importCampaigns(workspaceId: string, appId: string, rows: ImportRow<ImportCampaignInput>[]): Promise<ImportIds> {
    await this.ready(workspaceId);
    return importInChunks(this.ctx.storage, rows, (row) => importCampaignRow(this.ctx.storage.sql, appId, row));
  }

  // One transaction per call: a failed row rolls back the whole batch, and a repeat import creates nothing.
  async importMessages(workspaceId: string, appId: string, rows: ImportMessageRow[]): Promise<{ created: number; existing: number }> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => {
      const total = { created: 0, existing: 0 };
      for (const row of rows) total[importMessageRow(this.ctx.storage.sql, appId, row) ? "created" : "existing"] += 1;
      return total;
    });
  }

  // Each row goes through writeSuppression, so the reason rank holds: a complaint is never narrowed to an unsubscribe.
  async importSuppressions(workspaceId: string, rows: { email: string; reason: SuppressionReason; stream?: Stream }[]): Promise<ImportIds> {
    await this.ready(workspaceId);
    const total: ImportIds = { created: 0, existing: 0, ids: {} };
    for (let start = 0; start < rows.length; start += IMPORT_TX_ROWS) {
      this.ctx.storage.transactionSync(() => {
        for (const row of rows.slice(start, start + IMPORT_TX_ROWS)) {
          const key = row.email.trim().toLowerCase();
          const had = this.db.select({ email: schema.suppression.email }).from(schema.suppression).where(eq(schema.suppression.email, key)).get() !== undefined;
          this.writeSuppression(key, row.reason, row.stream);
          total[had ? "existing" : "created"] += 1;
        }
      });
    }
    return total;
  }

  // Opts out of marketing mail from the message's sending domain only. The domain comes from the stored message, never the request.
  async unsubscribe(workspaceId: string, messageId: string, now = Date.now()): Promise<void> {
    await this.ready(workspaceId);
    this.ctx.storage.transactionSync(() => {
      const msg = this.db
        .select({
          toEmail: schema.message.toEmail,
          fromEmail: schema.message.fromEmail,
          campaignId: schema.message.campaignId,
          unsubscribedAt: schema.message.unsubscribedAt,
        })
        .from(schema.message)
        .where(eq(schema.message.id, messageId))
        .get();
      if (!msg?.toEmail || !msg.fromEmail) return;
      this.db
        .insert(schema.marketingOptout)
        .values({ email: msg.toEmail, domain: brandDomain(msg.fromEmail), createdAt: now })
        .onConflictDoNothing()
        .run();
      if (msg.unsubscribedAt !== null) return;
      this.db.update(schema.message).set({ unsubscribedAt: now }).where(eq(schema.message.id, messageId)).run();
      bumpCampaign(this.ctx.storage.sql, msg.campaignId, { unsubscribed: 1 });
    });
  }
  async listSuppressions(workspaceId: string, q: { prefix?: string; cursor?: string }): Promise<{ rows: SuppressionView[]; nextCursor: string | null }> {
    await this.ready(workspaceId);
    return listSuppressionRows(this.db, { prefix: q.prefix?.trim().toLowerCase(), cursor: q.cursor });
  }
  // Unsubscribe and complaint rows are kept: a recipient who opted out cannot be re-enabled from the console.
  async removeSuppression(workspaceId: string, email: string): Promise<"removed" | "missing" | "opted_out"> {
    await this.ready(workspaceId);
    const key = email.trim().toLowerCase();
    return this.ctx.storage.transactionSync(() => {
      const row = this.db.select({ reason: schema.suppression.reason }).from(schema.suppression).where(eq(schema.suppression.email, key)).get();
      if (!row) return "missing";
      if (row.reason !== "bounce" && row.reason !== "manual") return "opted_out";
      this.db.delete(schema.suppression).where(eq(schema.suppression.email, key)).run();
      return "removed";
    });
  }
  async refreshLimits(workspaceId: string): Promise<WorkspaceLimits> {
    await this.ready(workspaceId);
    return this.loadLimits(workspaceId);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    // A failed automation pass must not stop the sweep. It retries on the next alarm.
    const outcome = await this.runDueAutomations(now).catch((err: unknown) => {
      console.error("ClientDO: automation pass failed", err instanceof Error ? err.name : "unknown");
      return { sent: 0, skipped: 0, more: false, blocked: true };
    });
    await this.sweepQueued(now);
    await this.scheduleAlarmAt(nextAutomationAlarm(this.ctx.storage.sql, now, outcome));
  }

  // Workspace comes only from the KV binding. Unbound: nothing to sweep, and no reschedule.
  async sweepQueued(now = Date.now()): Promise<{ requeued: number; expired: number }> {
    const workspaceId = this.ctx.storage.kv.get<string>("workspace_id");
    if (workspaceId === undefined) {
      console.error("ClientDO: sweeper ran before any workspace was bound");
      return { requeued: 0, expired: 0 };
    }
    await this.ready(workspaceId);
    const expired = this.ctx.storage.transactionSync(() => {
      const rows = this.db
        .update(schema.message)
        .set({ status: "failed", error: "expired after 24h in queue", updatedAt: now })
        .where(and(eq(schema.message.status, "queued"), lt(schema.message.createdAt, now - EXPIRE_MS)))
        .returning({ campaignId: schema.message.campaignId })
        .all();
      const perCampaign = new Map<string, number>();
      for (const r of rows) if (r.campaignId) perCampaign.set(r.campaignId, (perCampaign.get(r.campaignId) ?? 0) + 1);
      for (const [campaignId, n] of perCampaign) bumpCampaign(this.ctx.storage.sql, campaignId, { queued: -n, failed: n });
      return rows.length;
    });
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
    this.ctx.storage.transactionSync(() =>
      this.db
        .update(schema.webhookDelivery)
        .set({ status: "failed", lastError: "expired", claimedUntil: null, updatedAt: now })
        .where(
          and(
            eq(schema.webhookDelivery.status, "pending"),
            sql`max(${schema.webhookDelivery.createdAt}, coalesce(${schema.webhookDelivery.retriedAt}, 0)) < ${now - EXPIRE_MS}`,
          ),
        )
        .run(),
    );
    const staleDeliveries = this.db
      .select({ id: schema.webhookDelivery.id })
      .from(schema.webhookDelivery)
      .where(
        and(
          eq(schema.webhookDelivery.status, "pending"),
          lt(schema.webhookDelivery.updatedAt, now - STALE_MS),
          or(isNull(schema.webhookDelivery.claimedUntil), lt(schema.webhookDelivery.claimedUntil, now)),
        ),
      )
      .orderBy(schema.webhookDelivery.createdAt)
      .limit(SWEEP_BATCH)
      .all();
    // Before the enqueue loops: if sendBatch keeps throwing past the alarm retries, the next sweep is still scheduled.
    if (stale.length > 0 || staleDeliveries.length > 0) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    for (let i = 0; i < stale.length; i += SWEEP_CHUNK) {
      const ids = stale.slice(i, i + SWEEP_CHUNK).map((row) => row.id);
      await this.env.SEND.sendBatch(ids.map((messageId) => ({ body: { workspaceId, messageId } })));
      // Per chunk, after its enqueue: a throw in a later chunk leaves the sent ones fresh for the next run.
      // One update per id: DO SQL caps bound parameters per query, so an IN list of 100 would not fit.
      this.ctx.storage.transactionSync(() => {
        for (const id of ids) this.db.update(schema.message).set({ updatedAt: now }).where(eq(schema.message.id, id)).run();
      });
    }
    for (let i = 0; i < staleDeliveries.length; i += SWEEP_CHUNK) {
      const ids = staleDeliveries.slice(i, i + SWEEP_CHUNK).map((row) => row.id);
      await this.env.WEBHOOKS.sendBatch(ids.map((deliveryId) => ({ body: { workspaceId, deliveryId } })));
      this.ctx.storage.transactionSync(() => {
        for (const id of ids) this.db.update(schema.webhookDelivery).set({ updatedAt: now }).where(eq(schema.webhookDelivery.id, id)).run();
      });
    }
    const queuedLeft = this.db
      .select({ id: schema.message.id })
      .from(schema.message)
      .where(eq(schema.message.status, "queued"))
      .limit(1)
      .get();
    const pendingLeft = this.db
      .select({ id: schema.webhookDelivery.id })
      .from(schema.webhookDelivery)
      .where(eq(schema.webhookDelivery.status, "pending"))
      .limit(1)
      .get();
    if (queuedLeft || pendingLeft) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    return { requeued: stale.length, expired };
  }

  // The snapshot lives in KV, so a stale copy survives eviction and a D1 outage. It is never stored when empty.
  private async limits(workspaceId: string, { forSender }: { forSender?: string } = {}): Promise<WorkspaceLimits> {
    const cached = this.ctx.storage.kv.get<WorkspaceLimits>("limits");
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    const senderMiss = forSender !== undefined && !cached?.senders[forSender];
    if (cached && age < LIMITS_TTL_MS && !(senderMiss && age > SENDER_RETRY_MS)) return { ...cached, postalAddress: cached.postalAddress ?? null };
    try {
      return await this.loadLimits(workspaceId);
    } catch (err) {
      console.error("ClientDO: failed to reload workspace limits, using the cached snapshot", err);
      return cached ?? { monthlyQuota: DEFAULT_MONTHLY_QUOTA, postalAddress: null, status: "active", senders: {}, fetchedAt: 0 };
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
      // false: no profile row yet (or no workspace), so nothing is reported and KV stays unset for a retry.
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

  // Marketing mail is also refused when the recipient opted out of this sending domain. Other streams ignore the domain.
  private suppressed(email: string, stream: Stream, from: string | null = null): boolean {
    if (
      stream === "marketing" &&
      from !== null &&
      this.db
        .select({ email: schema.marketingOptout.email })
        .from(schema.marketingOptout)
        .where(and(eq(schema.marketingOptout.email, email), eq(schema.marketingOptout.domain, brandDomain(from))))
        .get() !== undefined
    ) {
      return true;
    }
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

  // Call inside a transactionSync: the count and the insert it guards must not interleave.
  private monthUsed(now: number): number {
    const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
    const used = this.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.message)
      .where(
        and(eq(schema.message.direction, "out"), inArray(schema.message.status, ["queued", "sent"]), gte(schema.message.createdAt, monthStart)),
      )
      .get();
    return used?.n ?? 0;
  }
  private campaignHead(id: string): { status: string; runSeq: number } | undefined {
    return this.ctx.storage.sql
      .exec<{ status: string; runSeq: number }>("SELECT status, run_seq AS runSeq FROM campaign WHERE id = ?", id)
      .toArray()[0];
  }
  private findByKey(appId: string, key: string): SendResult | undefined {
    const row = this.db
      .select({ id: schema.message.id, status: schema.message.status })
      .from(schema.message)
      .where(and(eq(schema.message.appId, appId), eq(schema.message.idempotencyKey, key)))
      .get();
    return row ? { messageId: row.id, status: row.status as SendResult["status"], duplicate: true } : undefined;
  }
  async renderTemplate(
    workspaceId: string,
    appId: string,
    templateId: string,
    values: Record<string, string>,
  ): Promise<RenderedTemplate | "missing" | "disabled"> {
    await this.ready(workspaceId);
    const tpl = getTemplateRow(this.ctx.storage.sql, templateId);
    if (!tpl || tpl.appId !== appId) return "missing";
    if (!tpl.enabled) return "disabled";
    return {
      subject: renderMerge(tpl.subject, values, "subject"),
      html: renderMerge(tpl.html, values, "html"),
      text: renderMerge(tpl.text, values, "text"),
      hasUnsubscribe: hasMergeToken(tpl.html, "unsubscribe_url") || hasMergeToken(tpl.text, "unsubscribe_url"),
    };
  }
  async setAudienceHook(workspaceId: string, appId: string, input: AudienceHookInput): Promise<{ secret: string | null }> {
    await this.ready(workspaceId);
    return setAudienceHookRow(this.env, this.ctx.storage, workspaceId, appId, input);
  }
  async getAudienceHook(workspaceId: string, appId: string): Promise<AudienceHookView | null> {
    await this.ready(workspaceId);
    return audienceHookView(this.ctx.storage.sql, appId);
  }
  async deleteAudienceHook(workspaceId: string, appId: string): Promise<boolean> {
    await this.ready(workspaceId);
    return this.ctx.storage.transactionSync(() => deleteAudienceHookRow(this.ctx.storage.sql, appId));
  }
  async audienceCall(workspaceId: string, campaignId: string, runSeq: number): Promise<HookCall | "stale" | "no_hook"> {
    await this.ready(workspaceId);
    return audienceCallFor(this.env, this.ctx.storage, workspaceId, campaignId, runSeq);
  }
  // One page of a hook run. Replays are safe: rows are found by key, and the cursor moves only when p === n.
  async campaignHookPage(
    workspaceId: string,
    id: string,
    runSeq: number,
    n: number,
    page: AudiencePage,
    now = Date.now(),
  ): Promise<{ state: "more" | "done" | "stopped"; enqueued: number; paceMs: number }> {
    await this.ready(workspaceId);
    const sql = this.ctx.storage.sql;
    let enqueued = 0;
    const stopped = () => ({ state: "stopped" as const, enqueued, paceMs: 0 });
    const live = () => {
      const head = this.campaignHead(id);
      return head !== undefined && head.status === "sending" && head.runSeq === runSeq;
    };
    const setPaused = (error: string) =>
      sql.exec("UPDATE campaign SET status = 'paused', error = ?, updated_at = ? WHERE id = ? AND status = 'sending' AND run_seq = ?", error, now, id, runSeq);
    if (!live()) return stopped();
    const campaign = sql
      .exec<{ appId: string; fromEmail: string | null; subject: string; postalAddress: string | null; cursor: string | null }>(
        "SELECT app_id AS appId, from_email AS fromEmail, subject, postal_address AS postalAddress, cursor FROM campaign WHERE id = ?",
        id,
      )
      .one();
    const ingested = parseHookCursor(campaign.cursor).p;
    if (ingested > n) return { state: "more", enqueued: 0, paceMs: 0 };
    if (ingested < n) throw new Error("page out of order");
    const limits = await this.limits(workspaceId, { forSender: campaign.fromEmail ?? undefined });
    if (limits.fetchedAt === 0) throw new Error("limits unavailable");
    if (limits.status === "suspended") {
      this.ctx.storage.transactionSync(() => setPaused("workspace_suspended"));
      return stopped();
    }
    const sender = limits.senders[campaign.fromEmail ?? ""];
    if (!sender) {
      this.ctx.storage.transactionSync(() => setPaused("sender_not_verified"));
      return stopped();
    }
    const rate = sesSendRate(this.env, sender.sesRegion);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    const seen = new Set<string>();
    const rows: EnqueueRow[] = [];
    for (const r of page.recipients) {
      if (seen.has(r.email)) continue;
      seen.add(r.email);
      rows.push({
        email: r.email,
        firstName: r.firstName ?? null,
        lastName: r.lastName ?? null,
        data: r.data,
        lapsed: r.consent === "implied" && r.consentAt < now - IMPLIED_CONSENT_MS,
      });
    }
    for (let i = 0; i < rows.length; i += ENQUEUE_BATCH) {
      if (!live()) return stopped();
      const batch = await this.enqueueRecipients(
        { workspaceId, id, runSeq, appId: campaign.appId, fromEmail: campaign.fromEmail, subject: campaign.subject, postalAddress: campaign.postalAddress, cursor: "", limits, sender, rate, now, offset: enqueued },
        rows.slice(i, i + ENQUEUE_BATCH),
      );
      // Counted per batch: a row already held by an earlier page or run is not new, and a stop mid-page keeps the rows made so far.
      if (batch.created > 0) sql.exec("UPDATE campaign SET recipients = recipients + ?, updated_at = ? WHERE id = ? AND run_seq = ?", batch.created, now, id, runSeq);
      enqueued += batch.queued;
      if (batch.quotaHit) {
        this.ctx.storage.transactionSync(() => setPaused("quota_exceeded"));
        return stopped();
      }
    }
    // A pause during the batches leaves the cursor on this page: the resumed run refetches it and finds its rows by key.
    const finished = this.ctx.storage.transactionSync((): boolean | null => {
      if (!live() || parseHookCursor(sql.exec<{ cursor: string | null }>("SELECT cursor FROM campaign WHERE id = ?", id).one().cursor).p !== n) return null;
      const last = page.nextCursor === null;
      sql.exec(
        "UPDATE campaign SET cursor = ?, updated_at = ? WHERE id = ? AND run_seq = ?",
        JSON.stringify({ p: n + 1, c: page.nextCursor }),
        now,
        id,
        runSeq,
      );
      if (last) sql.exec("UPDATE campaign SET status = 'sent', finished_at = ?, updated_at = ? WHERE id = ? AND run_seq = ?", now, now, id, runSeq);
      return last;
    });
    if (finished === null) return stopped();
    return finished ? { state: "done", enqueued, paceMs: 0 } : { state: "more", enqueued, paceMs: Math.ceil(enqueued / rate) * 1000 };
  }
  // The sub-chunk body shared by lists and hooks: inserts the rows, then sends one batch. A row that lapsed is stored as suppressed.
  private async enqueueRecipients(
    ctx: EnqueueCtx,
    rows: EnqueueRow[],
  ): Promise<{ handled: number; created: number; queued: number; lastEmail: string; quotaHit: boolean }> {
    const sql = this.ctx.storage.sql;
    const queue: string[] = [];
    let handled = 0;
    let created = 0;
    let lastEmail = ctx.cursor;
    let quotaHit = false;
    this.ctx.storage.transactionSync(() => {
      let used = this.monthUsed(ctx.now);
      for (const r of rows) {
        const key = `campaign:${ctx.id}:${r.email}`;
        const existing = this.findByKey(ctx.appId, key);
        if (existing) {
          if (existing.status === "queued") queue.push(existing.messageId);
        } else {
          if (ctx.limits.monthlyQuota > 0 && used >= ctx.limits.monthlyQuota) {
            quotaHit = true;
            break;
          }
          const values = contactValues(r, ctx.postalAddress ?? "");
          const suppressed = r.lapsed === true || this.suppressed(r.email, "marketing", ctx.fromEmail);
          const messageId = newId("msg");
          this.db
            .insert(schema.message)
            .values({
              id: messageId,
              appId: ctx.appId,
              direction: "out",
              stream: "marketing",
              status: suppressed ? "suppressed" : "queued",
              error: r.lapsed === true ? "consent_lapsed" : null,
              idempotencyKey: key,
              event: "campaign",
              campaignId: ctx.id,
              fromEmail: ctx.fromEmail,
              fromName: ctx.sender.name,
              sesRegion: ctx.sender.sesRegion,
              toEmail: r.email,
              subject: renderMerge(ctx.subject, values, "subject"),
              text: null,
              htmlKey: null,
              mergeData: JSON.stringify({ email: r.email, firstName: r.firstName, lastName: r.lastName, data: r.data }),
              createdAt: ctx.now,
              updatedAt: ctx.now,
            })
            .run();
          created += 1;
          if (suppressed) bumpCampaign(sql, ctx.id, { suppressed: 1 });
          else {
            used += 1;
            queue.push(messageId);
            bumpCampaign(sql, ctx.id, { queued: 1 });
          }
        }
        lastEmail = r.email;
        handled += 1;
      }
    });
    const jobs = queue.map((messageId, i) => ({ body: { workspaceId: ctx.workspaceId, messageId }, delaySeconds: Math.floor((ctx.offset + i) / ctx.rate) }));
    if (jobs.length > 0) await this.env.SEND.sendBatch(jobs);
    return { handled, created, queued: queue.length, lastEmail, quotaHit };
  }

  async createAutomation(workspaceId: string, appId: string, input: AutomationInput): Promise<AutomationView | "bad_list" | "bad_template"> {
    await this.ready(workspaceId);
    return createAutomationRow(this.ctx.storage.sql, appId, input);
  }

  async listAutomations(workspaceId: string, appId?: string): Promise<AutomationView[]> {
    await this.ready(workspaceId);
    return listAutomationRows(this.ctx.storage.sql, appId);
  }

  async updateAutomation(workspaceId: string, id: string, patch: AutomationPatch): Promise<AutomationView | "missing" | "bad_template"> {
    await this.ready(workspaceId);
    return updateAutomationRow(this.ctx.storage.sql, id, patch);
  }

  async setAutomationEnabled(workspaceId: string, id: string, on: boolean, postalAddress: string | null) {
    await this.ready(workspaceId);
    const result = setAutomationEnabledRow(this.ctx.storage.sql, id, on, postalAddress);
    if (on) await this.scheduleAlarmAt(earliestDue(this.ctx.storage.sql));
    return result;
  }

  async deleteAutomation(workspaceId: string, id: string): Promise<"deleted" | "missing"> {
    await this.ready(workspaceId);
    return deleteAutomationRow(this.ctx.storage.sql, id);
  }

  // Bound workspace only: the alarm has no id of its own, so an unbound DO has no automations to run.
  async runDueAutomations(now = Date.now()): Promise<{ sent: number; skipped: number; more: boolean; blocked: boolean }> {
    const workspaceId = this.ctx.storage.kv.get<string>("workspace_id");
    if (workspaceId === undefined) return { sent: 0, skipped: 0, more: false, blocked: false };
    await this.ready(workspaceId);
    const limits = await this.limits(workspaceId);
    return runDueAutomationRows(
      this.ctx.storage.sql,
      {
        send: (input) => this.send(workspaceId, input),
        render: (appId, templateId, values) => this.renderTemplate(workspaceId, appId, templateId, values),
        refreshLimits: () => this.loadLimits(workspaceId),
        postalAddress: limits.postalAddress,
      },
      now,
    );
  }

  async exportMembers(workspaceId: string, listId: string, afterEmail: string | null): Promise<{ rows: MemberView[]; next: string | null } | null> {
    await this.ready(workspaceId);
    return exportMemberRows(this.ctx.storage.sql, listId, (email) => this.suppressed(email, "marketing"), afterEmail);
  }

  // Lowers the alarm only: the sweeper and automation runs share one alarm, and neither may push the other later.
  private async scheduleAlarmAt(at: number | null): Promise<void> {
    if (at === null) return;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || at < current) await this.ctx.storage.setAlarm(at);
  }
}

type EnqueueRow = MergeData & { lapsed?: boolean };
type EnqueueCtx = {
  workspaceId: string;
  id: string;
  runSeq: number;
  appId: string;
  fromEmail: string | null;
  subject: string;
  postalAddress: string | null;
  cursor: string;
  limits: WorkspaceLimits;
  sender: { name: string | null; sesRegion: string };
  rate: number;
  now: number;
  offset: number;
};
