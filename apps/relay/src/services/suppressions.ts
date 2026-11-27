import { maskEmails } from "../core/mask-emails";
import { clientFor } from "../do/client";
import type { Env } from "../env";
import { audit, type Principal } from "./principal";
import { type Stream } from "../shared/mail";

export async function listSuppressions(env: Env, p: Principal, q: { prefix?: string; cursor?: string }) {
  const { rows, nextCursor } = await clientFor(env, p.workspaceId).listSuppressions(p.workspaceId, q);
  return { rows, nextCursor };
}

export async function addSuppression(env: Env, p: Principal, input: { email: string; stream?: Stream }): Promise<void> {
  await clientFor(env, p.workspaceId).addSuppression(p.workspaceId, input.email, "manual", input.stream);
  await audit(env, p, "suppression.add", maskEmails(input.email.trim().toLowerCase()), { stream: input.stream ?? null });
}

export async function removeSuppression(env: Env, p: Principal, email: string): Promise<void> {
  await clientFor(env, p.workspaceId).removeSuppression(p.workspaceId, email);
  await audit(env, p, "suppression.remove", maskEmails(email.trim().toLowerCase()));
}
