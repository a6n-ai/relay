import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { createApiKey, revokeApiKey } from "../core/api-keys";
import { hookInputSchema } from "../core/audience-hook";
import { createApp } from "../core/apps";
import { clientFor } from "../core/messages";
import { KEY_ERROR } from "../core/webhook-crypto";
import { getWorkspaceProfile, SELF_SERVE_APP_CAP } from "../core/workspace-profile";
import { securityDb } from "../db/security/client";
import { apiKey, app } from "../db/security/schema";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { ConsoleError, type ConsoleActor, uniqueViolation } from "./actor";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export async function listApps(env: Env, actor: ConsoleActor) {
  const db = securityDb(env);
  const [apps, counts] = await Promise.all([
    db
      .select({ id: app.id, name: app.name, slug: app.slug })
      .from(app)
      .where(eq(app.workspaceId, actor.workspaceId))
      .orderBy(asc(app.createdAt)),
    db
      .select({ appId: sql<string>`json_extract(${apiKey.metadata}, '$.appId')`, n: count() })
      .from(apiKey)
      .where(and(eq(apiKey.referenceId, actor.workspaceId), eq(apiKey.enabled, true)))
      .groupBy(sql`json_extract(${apiKey.metadata}, '$.appId')`),
  ]);
  const live = new Map(counts.map((c) => [c.appId, c.n]));
  return apps.map((a) => ({ ...a, keyCount: live.get(a.id) ?? 0 }));
}

export async function getApp(env: Env, actor: ConsoleActor, appId: string) {
  const [row] = await securityDb(env)
    .select({ id: app.id, name: app.name, slug: app.slug })
    .from(app)
    .where(and(eq(app.id, appId), eq(app.workspaceId, actor.workspaceId)));
  if (!row) throw new ConsoleError(404, "not found");
  return row;
}

export async function addApp(env: Env, actor: ConsoleActor, input: { name: string; slug: string }): Promise<{ id: string }> {
  if (!SLUG.test(input.slug)) throw new ConsoleError(400, "invalid slug");
  const [taken] = await securityDb(env)
    .select({ id: app.id })
    .from(app)
    .where(and(eq(app.workspaceId, actor.workspaceId), eq(app.slug, input.slug)));
  if (taken) throw new ConsoleError(409, "slug taken");
  // shortcut: parallel addApp calls can all pass this count and exceed the self-serve app cap, add an atomic check if abuse appears
  if ((await getWorkspaceProfile(env, actor.workspaceId)).selfServe) {
    const [{ n }] = await securityDb(env).select({ n: count() }).from(app).where(eq(app.workspaceId, actor.workspaceId));
    if (n >= SELF_SERVE_APP_CAP) throw new ConsoleError(403, "self-serve workspaces have one app");
  }
  try {
    return await createApp(env, { workspaceId: actor.workspaceId, name: input.name, slug: input.slug });
  } catch (err) {
    if (uniqueViolation(err, "app.workspace_id, app.slug")) throw new ConsoleError(409, "slug taken");
    throw err;
  }
}

// The secret is never stored or listed: listKeys selects only the metadata columns the screen shows.
export async function listKeys(env: Env, actor: ConsoleActor, appId: string) {
  await getApp(env, actor, appId);
  const rows = await securityDb(env)
    .select({
      id: apiKey.id,
      name: apiKey.name,
      start: apiKey.start,
      enabled: apiKey.enabled,
      createdAt: apiKey.createdAt,
      lastRequest: apiKey.lastRequest,
    })
    .from(apiKey)
    .where(and(eq(apiKey.referenceId, actor.workspaceId), sql`json_extract(${apiKey.metadata}, '$.appId') = ${appId}`))
    .orderBy(desc(apiKey.createdAt));
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.getTime(),
    lastRequest: r.lastRequest?.getTime() ?? null,
  }));
}

export async function createKey(
  env: Env,
  actor: ConsoleActor,
  input: { appId: string; name: string },
): Promise<{ id: string; secret: string }> {
  await getApp(env, actor, input.appId);
  return createApiKey(env, { workspaceId: actor.workspaceId, appId: input.appId, name: input.name });
}

export async function revokeKey(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  if (!(await revokeApiKey(env, actor.workspaceId, id))) throw new ConsoleError(404, "not found");
}

const AUDIENCE_READ = { tenant: ["read"] };
const AUDIENCE_WRITE = { tenant: ["write"] };

// A binding names a Worker on this deployment, so only a super admin sets or removes one (admin.ts).
async function guardPlatformHook(env: Env, actor: ConsoleActor, appId: string): Promise<void> {
  if (actor.platformAdmin) return;
  const hook = await clientFor(env, actor.workspaceId).getAudienceHook(actor.workspaceId, appId);
  if (hook?.kind === "binding") throw new ConsoleError(403, "hook managed by platform admin");
}

// Https only: a binding names a Worker on this deployment, so only a super admin sets one (admin.ts).
export async function setAudienceHookFor(
  env: Env,
  actor: ConsoleActor,
  appId: string,
  input: { url: string; secret?: string; enabled?: boolean },
): Promise<{ secret: string | null }> {
  if (!allows(actor.roles, AUDIENCE_WRITE)) throw new ConsoleError(403, "forbidden");
  await getApp(env, actor, appId);
  await guardPlatformHook(env, actor, appId);
  const parsed = hookInputSchema.safeParse(input);
  if (!parsed.success) throw new ConsoleError(400, "invalid input");
  let result: { secret: string | null };
  try {
    result = await clientFor(env, actor.workspaceId).setAudienceHook(actor.workspaceId, appId, { kind: "https", ...parsed.data });
  } catch (err) {
    if (err instanceof Error && err.message === KEY_ERROR) throw new ConsoleError(503, "audience hook unavailable");
    throw err;
  }
  await writeAudit(env, { action: "app.audience_hook.set", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: appId, data: { appId } });
  return result;
}

export async function getAudienceHookFor(env: Env, actor: ConsoleActor, appId: string) {
  if (!allows(actor.roles, AUDIENCE_READ)) throw new ConsoleError(403, "forbidden");
  await getApp(env, actor, appId);
  const hook = await clientFor(env, actor.workspaceId).getAudienceHook(actor.workspaceId, appId);
  // Explicit fields: a spread of the RPC result would carry its Symbol.dispose member into the serialized loader data.
  return hook && { kind: hook.kind, url: hook.url, binding: hook.binding, enabled: hook.enabled };
}

export async function deleteAudienceHookFor(env: Env, actor: ConsoleActor, appId: string): Promise<void> {
  if (!allows(actor.roles, AUDIENCE_WRITE)) throw new ConsoleError(403, "forbidden");
  await getApp(env, actor, appId);
  await guardPlatformHook(env, actor, appId);
  if (!(await clientFor(env, actor.workspaceId).deleteAudienceHook(actor.workspaceId, appId))) throw new ConsoleError(404, "not found");
  await writeAudit(env, { action: "app.audience_hook.delete", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: appId, data: { appId } });
}
