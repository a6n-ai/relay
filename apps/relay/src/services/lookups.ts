import { z } from "zod";
import type { Env } from "../env";
import { audit, type KeyPrincipal } from "./principal";
import { removeSuppression } from "./suppressions";
import { maskEmails } from "../core/mask-emails";
import { clientFor } from "../do/client";
import { brandDomain } from "../core/campaigns";
import { verifiedSenders } from "./campaign-run";
import { RelayError } from "../shared/errors";
import { emailSchema } from "../shared/schemas";
import { EMAIL_MAX } from "../shared/limits";
import { STREAMS, SUPPRESSION_REASONS } from "../shared/mail";

// send() accepts any idempotency key length, and callers put URLs in keys, so 200 refused real keys.
const keysSchema = z.array(z.string().min(1).max(2000)).min(1).max(100);
const emailsSchema = z.array(emailSchema).min(1).max(100);
const suppressSchema = z.object({
  email: emailSchema,
  reason: z.enum(["unsubscribe", "manual"]),
  stream: z.literal("marketing").nullable(),
});

const sourceName = z.enum(["link", "one-click", "admin", "ses"]);
const removeSchema = z.object({ email: emailSchema, reason: z.enum(SUPPRESSION_REASONS) });
const resubscribeSchema = z.object({ email: emailSchema, from: emailSchema });
const importSchema = z.array(z.unknown()).max(500);
const importRowSchema = z.object({
  email: emailSchema,
  reason: z.enum(SUPPRESSION_REASONS),
  stream: z.enum(STREAMS).nullable(),
  source: sourceName.nullish(),
  // Generous: a rejected row is a lost block, and these are only labels.
  campaignRef: z.string().max(500).nullish(),
  campaignName: z.string().max(500).nullish(),
  createdAt: z.number().int().positive(),
});

const blockQuerySchema = z.object({
  reasons: z.array(z.enum(SUPPRESSION_REASONS)).optional(),
  streams: z.array(z.enum([...STREAMS, "all"])).optional(),
  sources: z.array(sourceName).optional(),
  from: z.number().int().optional(),
  to: z.number().int().optional(),
  search: z.string().max(EMAIL_MAX).optional(),
  sort: z.enum(["time", "address", "stream", "reason"]).default("time"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(500).default(50),
});

function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new RelayError("invalid input");
  return parsed.data;
}

export function messagesByKeys(env: Env, p: KeyPrincipal, input: unknown) {
  const keys = parseInput(keysSchema, input);
  return clientFor(env, p.workspaceId).messagesByKeys(p.workspaceId, p.appId, keys);
}

export async function suppressionStatus(env: Env, p: KeyPrincipal, input: unknown, from?: unknown) {
  const emails = parseInput(emailsSchema, input);
  const sender = from === undefined ? undefined : parseInput(emailSchema, from);
  return clientFor(env, p.workspaceId).suppressionRows(p.workspaceId, emails, sender);
}

export async function suppress(env: Env, p: KeyPrincipal, input: unknown): Promise<{ created: boolean }> {
  const data = parseInput(suppressSchema, input);
  const result = await clientFor(env, p.workspaceId).addSuppression(p.workspaceId, data.email, data.reason, data.stream ?? undefined);
  await audit(env, p, "suppression.add", p.appId, { created: result.created });
  return result;
}

export function listBlocks(env: Env, p: KeyPrincipal, input: unknown) {
  return clientFor(env, p.workspaceId).listBlocks(p.workspaceId, parseInput(blockQuerySchema, input));
}

export function blockSummary(env: Env, p: KeyPrincipal) {
  return clientFor(env, p.workspaceId).blockSummary(p.workspaceId);
}

// The Durable Object refuses unsubscribe and complaint: only the person reverses those.
export async function removeBlock(env: Env, p: KeyPrincipal, input: unknown) {
  const { email, reason } = parseInput(removeSchema, input);
  await removeSuppression(env, p, email, reason);
  return { removed: true as const };
}

export async function resubscribe(env: Env, p: KeyPrincipal, input: unknown) {
  const { email, from } = parseInput(resubscribeSchema, input);
  const senders = await verifiedSenders(env, p.workspaceId, p.appId);
  if (!senders.some((s) => brandDomain(s) === brandDomain(from))) throw new RelayError("sender not verified");
  const result = await clientFor(env, p.workspaceId).resubscribe(p.workspaceId, email, from);
  await audit(env, p, "suppression.resubscribe", maskEmails(email), { removed: result.removed });
  return result;
}

export async function importBlocks(env: Env, p: KeyPrincipal, input: unknown) {
  const accepted: z.output<typeof importRowSchema>[] = [];
  const rejected: number[] = [];
  parseInput(importSchema, input).forEach((row, index) => {
    const parsed = importRowSchema.safeParse(row);
    if (parsed.success) accepted.push(parsed.data);
    else rejected.push(index);
  });
  await clientFor(env, p.workspaceId).importBlocks(p.workspaceId, accepted);
  await audit(env, p, "suppression.import", p.appId, { accepted: accepted.length, rejected: rejected.length });
  return { accepted: accepted.length, rejected };
}
