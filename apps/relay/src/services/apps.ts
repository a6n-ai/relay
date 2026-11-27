import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { createApiKey, deleteApiKey, renameApiKey, revokeApiKey } from "./api-keys";
import { createApp } from "../core/apps";
import { getWorkspaceProfile, SELF_SERVE_APP_CAP } from "../core/workspace-profile";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { apiKey, app } from "../db/security/schema";
import type { Env } from "../env";
import { uniqueViolation } from "../auth/session";
import { audit, type Principal } from "./principal";
import { RelayError } from "../shared/errors";
import { SLUG_RE } from "../shared/schemas";


export async function listApps(env: Env, p: Principal) {
  const db = securityDb(env);
  const [apps, counts] = await Promise.all([
    db
      .select({ id: app.id, name: app.name, slug: app.slug })
      .from(app)
      .where(eq(app.workspaceId, p.workspaceId))
      .orderBy(asc(app.createdAt)),
    db
      .select({ appId: sql<string>`json_extract(${apiKey.metadata}, '$.appId')`, n: count() })
      .from(apiKey)
      .where(and(eq(apiKey.referenceId, p.workspaceId), eq(apiKey.enabled, true)))
      .groupBy(sql`json_extract(${apiKey.metadata}, '$.appId')`),
  ]);
  const live = new Map(counts.map((c) => [c.appId, c.n]));
  return apps.map((a) => ({ ...a, keyCount: live.get(a.id) ?? 0 }));
}

export async function getApp(env: Env, p: { workspaceId: string }, appId: string) {
  const [row] = await securityDb(env)
    .select({ id: app.id, name: app.name, slug: app.slug })
    .from(app)
    .where(and(eq(app.id, appId), eq(app.workspaceId, p.workspaceId)));
  if (!row) throw new RelayError("not found");
  return row;
}

export async function addApp(env: Env, p: Principal, input: { name: string; slug: string }): Promise<{ id: string }> {
  if (!SLUG_RE.test(input.slug)) throw new RelayError("invalid slug");
  const [taken] = await securityDb(env)
    .select({ id: app.id })
    .from(app)
    .where(and(eq(app.workspaceId, p.workspaceId), eq(app.slug, input.slug)));
  if (taken) throw new RelayError("slug taken");
  // shortcut: parallel addApp calls can all pass this count and exceed the self-serve app cap, add an atomic check if abuse appears
  if ((await getWorkspaceProfile(env, p.workspaceId)).selfServe) {
    const [{ n }] = await securityDb(env).select({ n: count() }).from(app).where(eq(app.workspaceId, p.workspaceId));
    if (n >= SELF_SERVE_APP_CAP) throw new RelayError("self-serve workspaces have one app");
  }
  try {
    return await createApp(env, { workspaceId: p.workspaceId, name: input.name, slug: input.slug });
  } catch (err) {
    if (uniqueViolation(err, "app.workspace_id, app.slug")) throw new RelayError("slug taken");
    throw err;
  }
}

export async function renameApp(env: Env, p: Principal, id: string, name: string): Promise<void> {
  const rows = await securityDb(env)
    .update(app)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(app.id, id), eq(app.workspaceId, p.workspaceId)))
    .returning({ id: app.id });
  if (!rows.length) throw new RelayError("not found");
}

// The secret is never stored or listed: listKeys selects only the metadata columns the screen shows.
export async function listKeys(env: Env, p: Principal, appId: string) {
  await getApp(env, p, appId);
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
    .where(and(eq(apiKey.referenceId, p.workspaceId), sql`json_extract(${apiKey.metadata}, '$.appId') = ${appId}`))
    .orderBy(desc(apiKey.createdAt));
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.getTime(),
    lastRequest: r.lastRequest?.getTime() ?? null,
  }));
}

export async function createKey(
  env: Env,
  p: Principal,
  input: { appId: string; name: string },
): Promise<{ id: string; secret: string }> {
  await getApp(env, p, input.appId);
  return createApiKey(env, { workspaceId: p.workspaceId, appId: input.appId, name: input.name });
}

export async function revokeKey(env: Env, p: Principal, id: string): Promise<void> {
  if (!(await revokeApiKey(env, p.workspaceId, id))) throw new RelayError("not found");
}

export async function deleteKey(env: Env, p: Principal, id: string): Promise<void> {
  if (!(await deleteApiKey(env, p.workspaceId, id))) throw new RelayError("not found");
}

export async function renameKey(env: Env, p: Principal, id: string, name: string): Promise<void> {
  if (!(await renameApiKey(env, p.workspaceId, id, name))) throw new RelayError("not found");
}

// Choices are the app's addresses that can send; the selected ids come from the app row and may be stale after an edit.
export async function getDefaultSenders(env: Env, p: Principal, appId: string) {
  const [[row], options] = await Promise.all([
    securityDb(env)
      .select({ transactionalId: app.defaultTransactionalAddressId, marketingId: app.defaultMarketingAddressId })
      .from(app)
      .where(and(eq(app.id, appId), eq(app.workspaceId, p.workspaceId))),
    coreDb(env)
      .select({ id: address.id, email: address.email })
      .from(address)
      .where(and(eq(address.workspaceId, p.workspaceId), eq(address.appId, appId), eq(address.canSend, true)))
      .orderBy(asc(address.email)),
  ]);
  if (!row) throw new RelayError("not found");
  return { ...row, options };
}

export async function setDefaultSenders(
  env: Env,
  p: Principal,
  appId: string,
  input: { transactionalId: string | null; marketingId: string | null },
): Promise<void> {
  await getApp(env, p, appId);
  const ids = [input.transactionalId, input.marketingId].filter((v): v is string => v !== null);
  if (ids.length) {
    const owned = await coreDb(env)
      .select({ id: address.id })
      .from(address)
      .where(and(inArray(address.id, ids), eq(address.workspaceId, p.workspaceId), eq(address.appId, appId), eq(address.canSend, true)));
    if (owned.length !== new Set(ids).size) throw new RelayError("sender not available");
  }
  await securityDb(env)
    .update(app)
    .set({ defaultTransactionalAddressId: input.transactionalId, defaultMarketingAddressId: input.marketingId, updatedAt: new Date() })
    .where(and(eq(app.id, appId), eq(app.workspaceId, p.workspaceId)));
  await audit(env, p, "app.default_senders", appId, { appId, transactionalId: input.transactionalId, marketingId: input.marketingId });
}
