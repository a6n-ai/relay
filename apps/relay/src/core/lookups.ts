import { z } from "zod";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import type { KeyScope } from "./api-keys";
import { clientFor } from "./messages";
import { RelayError } from "../shared/errors";
import { emailSchema } from "../shared/schemas";

// send() accepts any idempotency key length, and callers put URLs in keys, so 200 refused real keys.
const keysSchema = z.array(z.string().min(1).max(2000)).min(1).max(100);
const emailsSchema = z.array(emailSchema).min(1).max(100);
const suppressSchema = z.object({
  email: emailSchema,
  reason: z.enum(["unsubscribe", "manual"]),
  stream: z.literal("marketing").nullable(),
});

function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new RelayError("invalid input");
  return parsed.data;
}

export function messagesByKeysForScope(env: Env, scope: KeyScope, input: unknown) {
  const keys = parseInput(keysSchema, input);
  return clientFor(env, scope.workspaceId).messagesByKeys(scope.workspaceId, scope.appId, keys);
}

export async function suppressionStatusForScope(env: Env, scope: KeyScope, input: unknown, from?: unknown) {
  const emails = parseInput(emailsSchema, input);
  const sender = from === undefined ? undefined : parseInput(emailSchema, from);
  return clientFor(env, scope.workspaceId).suppressionRows(scope.workspaceId, emails, sender);
}

export async function suppressForScope(env: Env, scope: KeyScope, input: unknown): Promise<{ created: boolean }> {
  const data = parseInput(suppressSchema, input);
  const result = await clientFor(env, scope.workspaceId).addSuppression(scope.workspaceId, data.email, data.reason, data.stream ?? undefined);
  await writeAudit(env, { action: "suppression.add", actorUserId: null, workspaceId: scope.workspaceId, target: scope.appId, data: { keyId: scope.keyId, created: result.created } });
  return result;
}
