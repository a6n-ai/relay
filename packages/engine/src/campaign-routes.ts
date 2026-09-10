import { desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import type { AudienceDef, CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import type { UsersRef } from "./enqueue";
import { countAudience, type AudienceDeps } from "./audience";
import { materializeCampaign } from "./campaign";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface CampaignRouteDeps {
  db: Db;
  tables: NotificationTables & CampaignTables;
  users: UsersRef;
  resolveSegment: AudienceDeps["resolveSegment"];
}

const audienceSchema = z.object({
  segment: z
    .object({
      lastOrderAfter: z.number().int().optional(),
      lastOrderBefore: z.number().int().optional(),
      minOrderCount: z.number().int().positive().optional(),
      minTotalSpend: z.number().positive().optional(),
      requireVerifiedPhone: z.boolean().optional(),
    })
    .optional(),
  listIds: z.array(z.string()).optional(),
});

export function createCampaignSchema(channels: [string, ...string[]]) {
  return z.object({
    name: z.string().trim().min(1),
    channels: z.array(z.enum(channels)).min(1),
    audience: audienceSchema,
    scheduledAt: z.number().int().positive().nullable().optional(),
  });
}

export interface CampaignListRow {
  publicId: string;
  name: string;
  channels: string[];
  status: string;
  scheduledAt: number | null;
  sentAt: number | null;
  counts: Record<string, number>;
  createdAt: number;
}

export async function listCampaigns(deps: CampaignRouteDeps): Promise<CampaignListRow[]> {
  const { db, tables } = deps;
  const rows = await db
    .select({
      publicId: tables.campaign.publicId,
      name: tables.campaign.name,
      channels: tables.campaign.channels,
      status: tables.campaign.status,
      scheduledAt: tables.campaign.scheduledAt,
      sentAt: tables.campaign.sentAt,
      counts: tables.campaign.counts,
      createdAt: tables.campaign.createdAt,
    })
    .from(tables.campaign)
    .orderBy(desc(tables.campaign.createdAt));
  return rows as CampaignListRow[];
}

export interface CreateCampaignInput {
  name: string;
  channels: string[];
  audience: AudienceDef;
  scheduledAt?: number | null;
}

export async function createCampaign(
  deps: CampaignRouteDeps,
  input: CreateCampaignInput,
): Promise<{ publicId: string }> {
  const { db, tables } = deps;
  const [row] = await db
    .insert(tables.campaign)
    .values({
      name: input.name,
      // channels is the shared notificationChannel pgEnum (fixed across all
      // apps); this function is generic, so the string[] input is widened here.
      channels: input.channels as never,
      audience: input.audience,
      // A campaign with a time is scheduled; without one it stays a draft until
      // someone presses Send.
      status: input.scheduledAt ? "scheduled" : "draft",
      scheduledAt: input.scheduledAt ?? null,
    })
    .returning({ publicId: tables.campaign.publicId });
  return { publicId: row.publicId as string };
}

const campaignAttachmentSchema = z.object({
  filename: z.string().trim().min(1),
  url: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
});

export const setCampaignContentSchema = z.object({
  channel: z.string(),
  locale: z.string(),
  subject: z.string().trim().min(1),
  body: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  /** WhatsApp / templated SMS: the provider-side pre-approved template id. */
  providerTemplateId: z.string().trim().optional(),
  /** email only. */
  attachments: z.array(campaignAttachmentSchema).optional(),
});

export interface SetCampaignContentInput {
  channel: string;
  locale: string;
  subject: string;
  body?: string;
  html?: string;
  text?: string;
  providerTemplateId?: string;
  attachments?: { filename: string; url: string; contentType: string }[];
}

export async function setCampaignContent(
  deps: CampaignRouteDeps,
  campaignPublicId: string,
  input: SetCampaignContentInput,
): Promise<{ ok: true } | { error: string; status: number }> {
  const { db, tables } = deps;

  const [row] = await db
    .select({ id: tables.campaign.id, status: tables.campaign.status })
    .from(tables.campaign)
    .where(eq(tables.campaign.publicId, campaignPublicId));
  if (!row) return { error: "Campaign not found", status: 404 };
  // Editing copy after the outbox rows exist would not change what was sent,
  // and would make the stored content disagree with the delivered message.
  if (row.status !== "draft" && row.status !== "scheduled") {
    return { error: "Content can only be edited while a campaign is draft or scheduled", status: 409 };
  }

  if (input.channel === "email" && (!input.html || !input.text)) {
    return { error: "Email content needs html and text", status: 400 };
  }
  if (input.channel !== "email" && !input.body && !input.providerTemplateId) {
    return { error: "Content needs a body or a provider template id", status: 400 };
  }

  await db
    .insert(tables.campaignContent)
    .values({
      campaignId: row.id,
      // channel is the shared notificationChannel pgEnum; locale is a fixed
      // literal enum per-app (makeCampaignTables<L>). Both widened for the
      // same reason as channels above.
      channel: input.channel as never,
      locale: input.locale as never,
      subject: input.subject,
      body: input.body ?? null,
      html: input.html ?? null,
      text: input.text ?? null,
      providerTemplateId: input.providerTemplateId ?? null,
      attachments: input.attachments ?? [],
    })
    .onConflictDoUpdate({
      target: [tables.campaignContent.campaignId, tables.campaignContent.channel, tables.campaignContent.locale],
      set: {
        subject: input.subject,
        body: input.body ?? null,
        html: input.html ?? null,
        text: input.text ?? null,
        providerTemplateId: input.providerTemplateId ?? null,
        attachments: input.attachments ?? [],
      },
    });

  return { ok: true };
}

export async function sendCampaign(
  deps: CampaignRouteDeps,
  campaignPublicId: string,
  confirmedCount: number,
): Promise<{ queued: number; warning?: string }> {
  const { queued } = await materializeCampaign(deps, campaignPublicId);
  // A send is irreversible. If the audience moved between the admin approving
  // a number and this call, say so rather than quietly mailing a different set.
  if (queued !== confirmedCount) {
    return { queued, warning: `Audience changed: approved ${confirmedCount}, queued ${queued}` };
  }
  return { queued };
}

export async function getAudienceCount(
  deps: CampaignRouteDeps,
  audience: AudienceDef,
): Promise<{ count: number }> {
  const count = await countAudience(deps, audience);
  return { count };
}

export interface DuplicateCampaignInput {
  /** Defaults to "<original name> (copy)". */
  name?: string;
  /** Defaults to the original campaign's audience. Pass to duplicate onto a different list. */
  audience?: AudienceDef;
}

/**
 * Clone a campaign's name/channels/content into a new draft. Content is
 * copied, not referenced, so editing the copy never touches the original —
 * campaign_content rows are immutable once a campaign leaves draft.
 */
export async function duplicateCampaign(
  deps: CampaignRouteDeps,
  campaignPublicId: string,
  input: DuplicateCampaignInput = {},
): Promise<{ publicId: string } | { error: string; status: number }> {
  const { db, tables } = deps;

  const [source] = await db
    .select({
      id: tables.campaign.id,
      name: tables.campaign.name,
      channels: tables.campaign.channels,
      audience: tables.campaign.audience,
    })
    .from(tables.campaign)
    .where(eq(tables.campaign.publicId, campaignPublicId));
  if (!source) return { error: "Campaign not found", status: 404 };

  const content = await db
    .select({
      channel: tables.campaignContent.channel,
      locale: tables.campaignContent.locale,
      subject: tables.campaignContent.subject,
      body: tables.campaignContent.body,
      html: tables.campaignContent.html,
      text: tables.campaignContent.text,
      providerTemplateId: tables.campaignContent.providerTemplateId,
      attachments: tables.campaignContent.attachments,
    })
    .from(tables.campaignContent)
    .where(eq(tables.campaignContent.campaignId, source.id));

  const [copy] = await db
    .insert(tables.campaign)
    .values({
      name: input.name ?? `${source.name} (copy)`,
      channels: source.channels,
      audience: input.audience ?? (source.audience as AudienceDef),
      status: "draft",
    })
    .returning({ id: tables.campaign.id, publicId: tables.campaign.publicId });

  if (content.length > 0) {
    await db.insert(tables.campaignContent).values(
      content.map((c) => ({ ...c, campaignId: copy.id })),
    );
  }

  return { publicId: copy.publicId as string };
}

export interface RetriggerCampaignInput {
  /** Restrict the resend to these contact lists only; omit to reuse the whole original audience. */
  listIds?: string[];
}

/**
 * Resend a campaign that has already gone out. A sent campaign's outbox rows
 * are keyed by its own publicId (`cmp:<id>:<address>`), so re-materializing
 * the same campaign row is a no-op by design — a retrigger has to be a new
 * campaign (new dedupe namespace) that copies the original's content, not a
 * re-run of the original.
 */
export async function retriggerCampaign(
  deps: CampaignRouteDeps,
  campaignPublicId: string,
  input: RetriggerCampaignInput = {},
): Promise<{ publicId: string; queued: number } | { error: string; status: number }> {
  const { db, tables } = deps;

  const [source] = await db
    .select({ name: tables.campaign.name, audience: tables.campaign.audience })
    .from(tables.campaign)
    .where(eq(tables.campaign.publicId, campaignPublicId));
  if (!source) return { error: "Campaign not found", status: 404 };

  const audience: AudienceDef = input.listIds
    ? { ...(source.audience as AudienceDef), segment: undefined, listIds: input.listIds }
    : (source.audience as AudienceDef);

  const copy = await duplicateCampaign(deps, campaignPublicId, {
    name: `${source.name} (retrigger ${new Date().toISOString().slice(0, 10)})`,
    audience,
  });
  if ("error" in copy) return copy;

  const { queued } = await materializeCampaign(deps, copy.publicId);
  return { publicId: copy.publicId, queued };
}
