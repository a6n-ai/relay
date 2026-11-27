import { and, eq } from "drizzle-orm";
import type { InboundResult } from "../do/inbound";
import { clientFor } from "../core/messages";
import { bumpUsage, utcDay } from "../core/usage";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import type { Env, InboundJob } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { ConsoleError, type ConsoleActor } from "./actor";
import { messageAccess } from "./messages";

const READ = { mailbox: ["read"] };
const MANAGE = { mailbox: ["manage"] };

function requireWrite(actor: ConsoleActor): void {
  if (!allows(actor.roles, MANAGE)) throw new ConsoleError(403, "forbidden");
  if (actor.workspaceStatus === "suspended") throw new ConsoleError(403, "workspace suspended");
}

export type ReplayResult =
  | { outcome: "inserted"; messageId: string }
  | { outcome: "duplicate"; messageId: string }
  | { outcome: "failed"; error: string };

export async function listFailuresFor(env: Env, actor: ConsoleActor) {
  if (!allows(actor.roles, READ)) throw new ConsoleError(403, "forbidden");
  const { inbound } = await messageAccess(env, actor);
  return clientFor(env, actor.workspaceId).listInboundFailures(actor.workspaceId, inbound);
}

export async function replayFailureFor(env: Env, actor: ConsoleActor, id: string): Promise<ReplayResult> {
  requireWrite(actor);
  const stub = clientFor(env, actor.workspaceId);
  const failure = await stub.getInboundFailure(actor.workspaceId, id);
  if (!failure) throw new ConsoleError(404, "not found");
  if (!failure.appId || !failure.addressId) throw new ConsoleError(409, "cannot replay");
  const [inbox] = await coreDb(env)
    .select({ id: address.id })
    .from(address)
    .where(
      and(eq(address.id, failure.addressId), eq(address.workspaceId, actor.workspaceId), eq(address.appId, failure.appId)),
    );
  if (!inbox) throw new ConsoleError(409, "address removed");
  const job: InboundJob = {
    workspaceId: actor.workspaceId,
    appId: failure.appId,
    addressId: failure.addressId,
    rawKey: failure.rawKey,
    envelopeFrom: failure.envelopeFrom ?? "",
    envelopeTo: failure.envelopeTo,
    authResults: failure.authResults,
    receivedAt: failure.receivedAt,
  };
  let result: InboundResult;
  try {
    result = await stub.ingestInbound(actor.workspaceId, job);
  } catch (err) {
    if (err instanceof Error && err.message === "raw mail missing") throw new ConsoleError(409, "raw letter missing");
    throw err;
  }
  if (result.outcome === "inserted") await bumpUsage(env, actor.workspaceId, utcDay(failure.receivedAt), { inbound: 1 });
  if (result.outcome === "duplicate") await stub.deleteInboundFailure(actor.workspaceId, id);
  await writeAudit(env, {
    action: "inbound_failure.replay",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: id,
    data: { outcome: result.outcome },
  });
  return result.outcome === "failed"
    ? { outcome: "failed", error: result.error }
    : { outcome: result.outcome, messageId: result.messageId };
}

export async function deleteFailureFor(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  requireWrite(actor);
  const removed = await clientFor(env, actor.workspaceId).deleteInboundFailure(actor.workspaceId, id);
  if (!removed) throw new ConsoleError(404, "not found");
  await writeAudit(env, {
    action: "inbound_failure.delete",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: id,
  });
}
