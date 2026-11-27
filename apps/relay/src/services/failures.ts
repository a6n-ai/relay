import { and, eq } from "drizzle-orm";
import type { InboundResult } from "../do/inbound";
import { clientFor } from "../do/client";
import { bumpUsage, utcDay } from "../core/usage";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import type { Env } from "../env";
import type { InboundJob } from "../core/jobs";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { type ConsoleActor } from "../core/session";
import { messageAccess } from "./inbox";
import { RelayError, codeOf } from "../shared/errors";

const READ = { mailbox: ["read"] };
const MANAGE = { mailbox: ["manage"] };

function requireWrite(actor: ConsoleActor): void {
  if (!allows(actor.roles, MANAGE)) throw new RelayError("forbidden");
  if (actor.workspaceStatus === "suspended") throw new RelayError("workspace suspended");
}

type ReplayResult =
  | { outcome: "inserted"; messageId: string }
  | { outcome: "duplicate"; messageId: string }
  | { outcome: "failed"; error: string };

export async function listFailuresFor(env: Env, actor: ConsoleActor) {
  if (!allows(actor.roles, READ)) throw new RelayError("forbidden");
  const { inbound } = await messageAccess(env, actor);
  return clientFor(env, actor.workspaceId).listInboundFailures(actor.workspaceId, inbound);
}

export async function replayFailureFor(env: Env, actor: ConsoleActor, id: string): Promise<ReplayResult> {
  requireWrite(actor);
  const stub = clientFor(env, actor.workspaceId);
  const failure = await stub.getInboundFailure(actor.workspaceId, id);
  if (!failure) throw new RelayError("not found");
  if (!failure.appId || !failure.addressId) throw new RelayError("cannot replay");
  const [inbox] = await coreDb(env)
    .select({ id: address.id })
    .from(address)
    .where(
      and(eq(address.id, failure.addressId), eq(address.workspaceId, actor.workspaceId), eq(address.appId, failure.appId)),
    );
  if (!inbox) throw new RelayError("address removed");
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
    if (codeOf(err) === "raw mail missing") throw new RelayError("raw letter missing");
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
  if (!removed) throw new RelayError("not found");
  await writeAudit(env, {
    action: "inbound_failure.delete",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: id,
  });
}
