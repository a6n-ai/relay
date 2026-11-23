import { and, eq, isNull } from "drizzle-orm";
import { securityDb } from "../db/security/client";
import { apiKey, app, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { newId } from "../lib/ids";

export type KeyScope = { workspaceId: string; appId: string; keyId: string };

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
  const db = securityDb(env);
  const [owner] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, input.appId));
  if (owner?.workspaceId !== input.workspaceId) throw new Error("app does not belong to workspace");
  await db.insert(apiKey).values({
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
  await securityDb(env).update(apiKey).set({ revokedAt: new Date() }).where(eq(apiKey.id, id));
}

// No cache: a revoked key or a suspended workspace is refused on the next call.
export async function resolveApiKey(env: Env, secret: string): Promise<KeyScope | null> {
  const hash = await sha256Hex(secret);
  const [row] = await securityDb(env)
    .select({ workspaceId: apiKey.workspaceId, appId: apiKey.appId, keyId: apiKey.id })
    .from(apiKey)
    .innerJoin(workspace, eq(workspace.id, apiKey.workspaceId))
    .where(and(eq(apiKey.hash, hash), isNull(apiKey.revokedAt), eq(workspace.status, "active")));
  return row ?? null;
}

export async function resolveBearer(env: Env, request: Request): Promise<KeyScope | null> {
  const secret = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  return secret ? resolveApiKey(env, secret) : null;
}
