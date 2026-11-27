import { maskEmails } from "../core/mask-emails";
import { clientFor } from "../core/messages";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { type ConsoleActor } from "./actor";
import { RelayError } from "../shared/errors";
import { type Stream } from "../shared/mail";

const READ = { sending: ["read"] };
const WRITE = { sending: ["write"] };

function requireWrite(actor: ConsoleActor): void {
  if (!allows(actor.roles, WRITE)) throw new RelayError("forbidden");
  if (actor.workspaceStatus === "suspended") throw new RelayError("workspace suspended");
}

export async function listSuppressionsFor(env: Env, actor: ConsoleActor, q: { prefix?: string; cursor?: string }) {
  if (!allows(actor.roles, READ)) throw new RelayError("forbidden");
  const { rows, nextCursor } = await clientFor(env, actor.workspaceId).listSuppressions(actor.workspaceId, q);
  return { rows, nextCursor };
}

export async function addSuppressionFor(env: Env, actor: ConsoleActor, input: { email: string; stream?: Stream }): Promise<void> {
  requireWrite(actor);
  await clientFor(env, actor.workspaceId).addSuppression(actor.workspaceId, input.email, "manual", input.stream);
  await writeAudit(env, {
    action: "suppression.add",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: maskEmails(input.email.trim().toLowerCase()),
    data: { stream: input.stream ?? null },
  });
}

export async function removeSuppressionFor(env: Env, actor: ConsoleActor, email: string): Promise<void> {
  requireWrite(actor);
  const outcome = await clientFor(env, actor.workspaceId).removeSuppression(actor.workspaceId, email);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "opted_out") throw new RelayError("recipient opted out");
  await writeAudit(env, {
    action: "suppression.remove",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: maskEmails(email.trim().toLowerCase()),
  });
}
