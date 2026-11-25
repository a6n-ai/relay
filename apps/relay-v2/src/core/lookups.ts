import { z } from "zod";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { ApiError } from "./api-error";
import type { KeyScope } from "./api-keys";
import { clientFor } from "./messages";

const keysSchema = z.array(z.string().min(1).max(200)).min(1).max(100);
const emailsSchema = z.array(z.string().trim().toLowerCase().max(254).email()).min(1).max(100);
const suppressSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  reason: z.enum(["unsubscribe", "manual"]),
  stream: z.literal("marketing").nullable(),
});

function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "invalid input");
  return parsed.data;
}

export function messagesByKeysForScope(env: Env, scope: KeyScope, input: unknown) {
  const keys = parseInput(keysSchema, input);
  return clientFor(env, scope.workspaceId).messagesByKeys(scope.workspaceId, scope.appId, keys);
}

// shortcut: apps store no default From, so there is no sending brand to check and brandOptOut stays false, upgrade when apps store one.
export async function suppressionStatusForScope(env: Env, scope: KeyScope, input: unknown) {
  const emails = parseInput(emailsSchema, input);
  const rows = await clientFor(env, scope.workspaceId).suppressionRows(scope.workspaceId, emails);
  return rows.map((row) => ({ ...row, brandOptOut: false }));
}

export async function suppressForScope(env: Env, scope: KeyScope, input: unknown): Promise<{ created: boolean }> {
  const data = parseInput(suppressSchema, input);
  const result = await clientFor(env, scope.workspaceId).addSuppression(scope.workspaceId, data.email, data.reason, data.stream ?? undefined);
  await writeAudit(env, { action: "suppression.add", actorUserId: null, workspaceId: scope.workspaceId, target: scope.appId, data: { keyId: scope.keyId, created: result.created } });
  return result;
}
