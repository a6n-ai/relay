import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import type { Env } from "../env";
import { emailSchema, mergeDataSchema } from "../shared/schemas";
import { HOOK_PAGE_LIMIT, type AudiencePage, type HookCall, type HookRecipient } from "./audience-protocol";
import { httpsUrl, isPublicWebhookUrl } from "./webhooks";
import { RelayError, type ErrorCode } from "../shared/errors";

const HOOK_RESPONSE_CAP = 1_000_000;
const HOOK_TIMEOUT_MS = 15_000;
export const AUDIENCE_FAILED = "audience_failed" satisfies ErrorCode;

const recipientSchema = z.object({
  email: emailSchema,
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
  if (res.status >= 500 || res.status === 429) throw new RelayError("audience hook unavailable");
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
