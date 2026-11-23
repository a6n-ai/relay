import { and, eq, isNull } from "drizzle-orm";
import { centralDb } from "../db/central/client";
import { apiKey, app } from "../db/central/schema";
import type { Env } from "../env";
import { newId } from "../lib/ids";

export type KeyScope = { workspaceId: string; appId: string; keyId: string };

// shortcut: revoke clears only this isolate's cache, so other isolates may honour a revoked key for up to 60 s; cross-isolate invalidation needs KV or a DO later.
const TTL_MS = 60_000;
const cache = new Map<string, { scope: KeyScope; expires: number }>();

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createApiKey(
  env: Env,
  input: { workspaceId: string; appId: string; name: string },
): Promise<{ id: string; secret: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const secret = `rk_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_")}`;
  const id = newId("key");
  const owner = await centralDb(env).select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, input.appId)).get();
  if (owner?.workspaceId !== input.workspaceId) throw new Error("app does not belong to workspace");
  await centralDb(env).insert(apiKey).values({
    id,
    workspaceId: input.workspaceId,
    appId: input.appId,
    name: input.name,
    prefix: secret.slice(0, 8),
    hash: await sha256Hex(secret),
  });
  return { id, secret };
}

export async function revokeApiKey(env: Env, id: string): Promise<void> {
  const [row] = await centralDb(env)
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(eq(apiKey.id, id))
    .returning({ hash: apiKey.hash });
  if (row) cache.delete(row.hash);
}

export async function resolveApiKey(env: Env, secret: string): Promise<KeyScope | null> {
  const hash = await sha256Hex(secret);
  const hit = cache.get(hash);
  if (hit && hit.expires > Date.now()) return hit.scope;

  const row = await centralDb(env)
    .select({ workspaceId: apiKey.workspaceId, appId: apiKey.appId, keyId: apiKey.id })
    .from(apiKey)
    .where(and(eq(apiKey.hash, hash), isNull(apiKey.revokedAt)))
    .get();
  if (!row) return null;
  cache.set(hash, { scope: row, expires: Date.now() + TTL_MS });
  return row;
}

export async function resolveBearer(env: Env, request: Request): Promise<KeyScope | null> {
  const secret = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  return secret ? resolveApiKey(env, secret) : null;
}
