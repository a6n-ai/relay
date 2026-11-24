import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import type { Env } from "../env";
import { mergeDataSchema } from "./send-input";
import { writeAudit } from "../lib/auth/audit";
import type { KeyScope } from "./api-keys";
import { ApiError } from "./api-error";
import { clientFor } from "./messages";
import { KEY_ERROR, signBody } from "./webhook-crypto";
import { httpsUrl, isPublicWebhookUrl } from "./webhooks";

export const AUDIENCE_BINDINGS = ["TIFFIN_AUDIENCE"] as const;
export const HOOK_PAGE_LIMIT = 500;
export const HOOK_RESPONSE_CAP = 1_000_000;
const HOOK_TIMEOUT_MS = 15_000;
export const AUDIENCE_FAILED = "audience_failed";

/**
 * Hook protocol (v1).
 * Request: { type: "audience.page", appId, workspaceId, campaignId, audience: string | null, cursor: string | null, limit: 500, sentAt }. `audience` is the campaign's opaque `audience_query`, at most 1,000 characters. The body is signed in `x-relay-signature`; `sentAt` (epoch ms) is also sent as `x-relay-timestamp`. Receivers must check requests with `verifyAudienceRequest`.
 * Response: { recipients: HookRecipient[]; nextCursor: string | null }, with at most 500 recipients.
 * `HookRecipient` is { email, firstName?, lastName?, consent: "express" | "implied", consentAt: number, data?: Record<string, string> }. `data` holds at most 10 keys matching `/^[a-z0-9_]{1,40}$/`, and each value is at most 200 characters.
 * A recipient that fails validation is skipped and counted in the step output as `invalid`. A page that is not JSON, or has a bad shape, fails the run.
 */
export type AudienceRequest = {
  type: "audience.page";
  appId: string;
  workspaceId: string;
  campaignId: string;
  audience: string | null;
  cursor: string | null;
  limit: number;
  sentAt: number;
};

export type HookRecipient = {
  email: string;
  firstName?: string;
  lastName?: string;
  consent: "express" | "implied";
  consentAt: number;
  data?: Record<string, string>;
};

export type AudiencePage = { recipients: HookRecipient[]; nextCursor: string | null; invalid: number };

export type HookCall =
  | { kind: "https"; url: string; body: string; headers: Record<string, string> }
  | { kind: "binding"; binding: (typeof AUDIENCE_BINDINGS)[number]; request: AudienceRequest };

const recipientSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  firstName: z.string().max(200).optional(),
  lastName: z.string().max(200).optional(),
  consent: z.enum(["express", "implied"]),
  consentAt: z
    .number()
    .int()
    .positive()
    .refine((at) => at <= Date.now() + 5 * 60_000, "consent is in the future"),
  data: mergeDataSchema.optional(),
});

const pageSchema = z.object({
  recipients: z.array(z.unknown()),
  nextCursor: z.string().max(2048).nullable(),
});

export function parseAudiencePage(json: unknown): AudiencePage | null {
  const page = pageSchema.safeParse(json);
  if (!page.success || page.data.recipients.length > HOOK_PAGE_LIMIT) return null;
  const recipients: HookRecipient[] = [];
  let invalid = 0;
  for (const raw of page.data.recipients) {
    const parsed = recipientSchema.safeParse(raw);
    if (parsed.success) recipients.push(parsed.data);
    else invalid += 1;
  }
  return { recipients, nextCursor: page.data.nextCursor, invalid };
}

function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ (y[i % y.length] ?? 0);
  return diff === 0;
}

// Receivers must use this: it is the only check that covers sentAt, which sits inside the signed body.
export async function verifyAudienceRequest(
  secret: string,
  rawBody: string,
  headers: Headers,
  now: number,
  maxAgeMs = 300_000,
): Promise<boolean> {
  if (!sameText(headers.get("x-relay-signature") ?? "", `sha256=${await signBody(secret, rawBody)}`)) return false;
  const sentAt = (JSON.parse(rawBody) as { sentAt?: unknown }).sentAt;
  return typeof sentAt === "number" && now - sentAt <= maxAgeMs && sentAt - now <= 60_000;
}

export const hookInputSchema = z.object({
  url: httpsUrl,
  secret: z.string().min(16).max(256).optional(),
  enabled: z.boolean().optional(),
});

async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new NonRetryableError(AUDIENCE_FAILED);
    }
    chunks.push(value);
  }
  return new Blob(chunks).text();
}

export async function fetchAudiencePage(env: Env, call: HookCall): Promise<AudiencePage> {
  if (call.kind === "binding") {
    const target = env[call.binding];
    if (!target) throw new NonRetryableError(AUDIENCE_FAILED);
    const page = parseAudiencePage(await target.resolveAudience(call.request));
    if (!page) throw new NonRetryableError(AUDIENCE_FAILED);
    return page;
  }
  // Checked again at fetch time: a stored URL may predate a rule change, and a 3xx is a failure, never followed.
  if (!isPublicWebhookUrl(call.url)) throw new NonRetryableError(AUDIENCE_FAILED);
  const res = await fetch(call.url, {
    method: "POST",
    headers: call.headers,
    body: call.body,
    redirect: "manual",
    signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
  });
  if (res.status >= 500 || res.status === 429) throw new Error("audience hook unavailable");
  if (res.status < 200 || res.status >= 300) throw new NonRetryableError(AUDIENCE_FAILED);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > HOOK_RESPONSE_CAP) throw new NonRetryableError(AUDIENCE_FAILED);
  let json: unknown;
  try {
    json = JSON.parse(await readCapped(res, HOOK_RESPONSE_CAP));
  } catch (err) {
    if (err instanceof NonRetryableError) throw err;
    throw new NonRetryableError(AUDIENCE_FAILED);
  }
  const page = parseAudiencePage(json);
  if (!page) throw new NonRetryableError(AUDIENCE_FAILED);
  return page;
}

// Keys set https hooks only. A binding names a Worker on this deployment, so a key never sets or removes one.
async function guardBinding(env: Env, scope: KeyScope): Promise<void> {
  const hook = await clientFor(env, scope.workspaceId).getAudienceHook(scope.workspaceId, scope.appId);
  if (hook?.kind === "binding") throw new ApiError(403, "hook managed by platform admin");
}

export async function setAudienceHookForScope(env: Env, scope: KeyScope, input: unknown): Promise<{ secret: string | null }> {
  const parsed = hookInputSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "invalid input");
  await guardBinding(env, scope);
  let result: { secret: string | null };
  try {
    result = await clientFor(env, scope.workspaceId).setAudienceHook(scope.workspaceId, scope.appId, { kind: "https", ...parsed.data });
  } catch (err) {
    if (err instanceof Error && err.message === KEY_ERROR) throw new ApiError(503, "audience hook unavailable");
    throw err;
  }
  await writeAudit(env, { action: "app.audience_hook.set", actorUserId: null, workspaceId: scope.workspaceId, target: scope.appId, data: { keyId: scope.keyId, appId: scope.appId } });
  return result;
}

// Explicit fields: the secret is never read back, and a binding's name stays with the platform.
export async function getAudienceHookForScope(env: Env, scope: KeyScope) {
  const hook = await clientFor(env, scope.workspaceId).getAudienceHook(scope.workspaceId, scope.appId);
  return hook && { kind: hook.kind, url: hook.url, enabled: hook.enabled };
}

export async function deleteAudienceHookForScope(env: Env, scope: KeyScope): Promise<void> {
  await guardBinding(env, scope);
  if (!(await clientFor(env, scope.workspaceId).deleteAudienceHook(scope.workspaceId, scope.appId))) throw new ApiError(404, "not found");
  await writeAudit(env, { action: "app.audience_hook.delete", actorUserId: null, workspaceId: scope.workspaceId, target: scope.appId, data: { keyId: scope.keyId, appId: scope.appId } });
}
