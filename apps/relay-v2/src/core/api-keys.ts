import { and, eq } from "drizzle-orm";
import { securityDb } from "../db/security/client";
import { apiKey, app, member, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { createAuth } from "../lib/auth";

export type KeyScope = { workspaceId: string; appId: string; keyId: string };

// Keys are created as the workspace owner, who holds the organization's apiKey create permission.
export async function createApiKey(
  env: Env,
  input: { workspaceId: string; appId: string; name: string },
): Promise<{ id: string; secret: string }> {
  const db = securityDb(env);
  const [owner] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, input.appId));
  if (owner?.workspaceId !== input.workspaceId) throw new Error("app does not belong to workspace");
  const [creator] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, input.workspaceId), eq(member.role, "owner")))
    .limit(1);
  if (!creator) throw new Error("workspace has no owner");
  const key = await createAuth(env).api.createApiKey({
    body: { userId: creator.userId, organizationId: input.workspaceId, name: input.name, metadata: { appId: input.appId } },
  });
  return { id: key.id, secret: key.key };
}

export async function revokeApiKey(env: Env, workspaceId: string, id: string): Promise<boolean> {
  const rows = await securityDb(env)
    .update(apiKey)
    .set({ enabled: false })
    .where(and(eq(apiKey.id, id), eq(apiKey.referenceId, workspaceId)))
    .returning({ id: apiKey.id });
  return rows.length > 0;
}

export async function renameApiKey(env: Env, workspaceId: string, id: string, name: string): Promise<boolean> {
  const rows = await securityDb(env)
    .update(apiKey)
    .set({ name })
    .where(and(eq(apiKey.id, id), eq(apiKey.referenceId, workspaceId)))
    .returning({ id: apiKey.id });
  return rows.length > 0;
}

// The plugin checks enabled and expiry against D1 on every call; the workspace status is read here.
export async function resolveApiKey(env: Env, secret: string): Promise<KeyScope | null> {
  const { valid, key } = await createAuth(env).api.verifyApiKey({ body: { key: secret } });
  if (!valid || !key) return null;
  const appId = (key.metadata as { appId?: unknown } | null)?.appId;
  if (typeof appId !== "string") return null;
  const [ws] = await securityDb(env)
    .select({ status: workspace.status })
    .from(workspace)
    .where(eq(workspace.id, key.referenceId));
  if (ws?.status !== "active") return null;
  return { workspaceId: key.referenceId, appId, keyId: key.id };
}

// Keyed by key id, so one key's traffic cannot spend another key's budget.
export async function withinRateLimit(env: Env, keyId: string): Promise<boolean> {
  return (await env.API_LIMIT.limit({ key: keyId })).success;
}

// Every key-authenticated route must also call withinRateLimit.
export async function resolveBearer(env: Env, request: Request): Promise<KeyScope | null> {
  const secret = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  return secret ? resolveApiKey(env, secret) : null;
}
