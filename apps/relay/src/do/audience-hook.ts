import { AUDIENCE_BINDINGS, HOOK_PAGE_LIMIT, type AudienceRequest, type HookCall } from "../core/audience-hook";
import { webhookHeaders } from "../core/mailbox-received";
import { decryptSecret, encryptSecret, newWebhookSecret, signBody } from "../core/webhook-crypto";
import { isPublicWebhookUrl } from "../core/webhooks";
import type { Env } from "../env";
import { RelayError } from "../shared/errors";

export type AudienceHookInput =
  | { kind: "https"; url: string; secret?: string; enabled?: boolean }
  | { kind: "binding"; binding: string; enabled?: boolean };
export type AudienceHookView = { kind: "https" | "binding"; url: string | null; binding: string | null; enabled: boolean };

type HookRow = { appId: string; kind: string; url: string | null; binding: string | null; secretEnc: string | null; enabled: number };

const aad = (workspaceId: string, appId: string) => `${workspaceId}:hook:${appId}`;
const HOOK_COLUMNS = "app_id AS appId, kind, url, binding, secret_enc AS secretEnc, enabled";

function hookRow(sql: SqlStorage, appId: string): HookRow | null {
  return sql.exec<HookRow>(`SELECT ${HOOK_COLUMNS} FROM audience_hook WHERE app_id = ?`, appId).toArray()[0] ?? null;
}

export function audienceHookView(sql: SqlStorage, appId: string): AudienceHookView | null {
  const row = hookRow(sql, appId);
  if (!row) return null;
  return { kind: row.kind as AudienceHookView["kind"], url: row.url, binding: row.binding, enabled: row.enabled === 1 };
}

// The plaintext secret is returned only when this call generates it; a kept secret is never returned again.
export async function setAudienceHookRow(
  env: Env,
  storage: DurableObjectStorage,
  workspaceId: string,
  appId: string,
  input: AudienceHookInput,
  now = Date.now(),
): Promise<{ secret: string | null }> {
  const enabled = input.enabled === false ? 0 : 1;
  if (input.kind === "binding") {
    if (!(AUDIENCE_BINDINGS as readonly string[]).includes(input.binding)) throw new RelayError("unknown binding");
    storage.transactionSync(() => upsertHook(storage.sql, appId, "binding", null, input.binding, null, enabled, now));
    return { secret: null };
  }
  const existing = hookRow(storage.sql, appId);
  const keepSecret = input.secret === undefined && existing?.kind === "https" && existing.secretEnc !== null;
  const secret = input.secret ?? (keepSecret ? null : newWebhookSecret());
  const secretEnc = keepSecret ? existing!.secretEnc : await encryptSecret(env.WEBHOOK_SECRET_KEY, secret!, aad(workspaceId, appId));
  storage.transactionSync(() => upsertHook(storage.sql, appId, "https", input.url, null, secretEnc, enabled, now));
  return { secret: input.secret === undefined && !keepSecret ? secret : null };
}

function upsertHook(
  sql: SqlStorage,
  appId: string,
  kind: string,
  url: string | null,
  binding: string | null,
  secretEnc: string | null,
  enabled: number,
  now: number,
): void {
  sql.exec(
    `INSERT INTO audience_hook (app_id, kind, url, binding, secret_enc, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (app_id) DO UPDATE SET kind = excluded.kind, url = excluded.url, binding = excluded.binding,
       secret_enc = excluded.secret_enc, enabled = excluded.enabled, updated_at = excluded.updated_at`,
    appId,
    kind,
    url,
    binding,
    secretEnc,
    enabled,
    now,
    now,
  );
}

export function deleteAudienceHookRow(sql: SqlStorage, appId: string): boolean {
  if (!hookRow(sql, appId)) return false;
  sql.exec("DELETE FROM audience_hook WHERE app_id = ?", appId);
  return true;
}

// campaign.cursor for a hook run: `p` pages ingested so far, `c` the hook's next-page cursor.
export function parseHookCursor(raw: string | null): { p: number; c: string | null } {
  if (!raw) return { p: 0, c: null };
  const parsed = JSON.parse(raw) as { p?: unknown; c?: unknown };
  return { p: typeof parsed.p === "number" ? parsed.p : 0, c: typeof parsed.c === "string" ? parsed.c : null };
}

export async function audienceCallFor(
  env: Env,
  storage: DurableObjectStorage,
  workspaceId: string,
  campaignId: string,
  runSeq: number,
): Promise<HookCall | "stale" | "no_hook"> {
  const sql = storage.sql;
  const campaign = sql
    .exec<{ appId: string; status: string; runSeq: number; audienceQuery: string | null; cursor: string | null }>(
      "SELECT app_id AS appId, status, run_seq AS runSeq, audience_query AS audienceQuery, cursor FROM campaign WHERE id = ?",
      campaignId,
    )
    .toArray()[0];
  if (!campaign || campaign.status !== "sending" || campaign.runSeq !== runSeq) return "stale";
  const hook = hookRow(sql, campaign.appId);
  if (!hook || hook.enabled !== 1) return "no_hook";
  const request: AudienceRequest = {
    type: "audience.page",
    appId: campaign.appId,
    workspaceId,
    campaignId,
    audience: campaign.audienceQuery,
    cursor: parseHookCursor(campaign.cursor).c,
    limit: HOOK_PAGE_LIMIT,
    sentAt: Date.now(),
  };
  if (hook.kind === "binding") {
    if (!hook.binding || !(AUDIENCE_BINDINGS as readonly string[]).includes(hook.binding)) return "no_hook";
    return { kind: "binding", binding: hook.binding as (typeof AUDIENCE_BINDINGS)[number], request };
  }
  // A missing key throws KEY_ERROR, so the step retries rather than pausing the campaign.
  if (!hook.url || !isPublicWebhookUrl(hook.url) || !hook.secretEnc) return "no_hook";
  const secret = await decryptSecret(env.WEBHOOK_SECRET_KEY, hook.secretEnc, aad(workspaceId, campaign.appId));
  const body = JSON.stringify(request);
  const headers = { ...webhookHeaders("audience.page", await signBody(secret, body)), "x-relay-timestamp": String(request.sentAt) };
  return { kind: "https", url: hook.url, body, headers };
}
