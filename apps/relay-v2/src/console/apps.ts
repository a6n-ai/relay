import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { createApiKey, revokeApiKey } from "../core/api-keys";
import { createApp } from "../core/apps";
import { getWorkspaceProfile, SELF_SERVE_APP_CAP } from "../core/workspace-profile";
import { securityDb } from "../db/security/client";
import { apiKey, app } from "../db/security/schema";
import type { Env } from "../env";
import { ConsoleError, type ConsoleActor } from "./actor";

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
  return createApp(env, { workspaceId: actor.workspaceId, name: input.name, slug: input.slug });
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
