import { z } from "zod";
import type { Env } from "../env";
import { audit, type KeyPrincipal } from "./principal";
import { clientFor } from "../do/client";
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

const blockQuerySchema = z.object({
  reasons: z.array(z.enum(SUPPRESSION_REASONS)).optional(),
  streams: z.array(z.enum([...STREAMS, "all"])).optional(),
  sources: z.array(z.enum(["link", "one-click", "admin", "ses"])).optional(),
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
