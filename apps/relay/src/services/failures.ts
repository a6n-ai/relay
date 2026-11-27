import { and, eq } from "drizzle-orm";
import type { InboundResult } from "../do/inbound";
import { clientFor } from "../do/client";
import { bumpUsage, utcDay } from "../core/usage";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import type { Env } from "../env";
import type { InboundJob } from "../core/jobs";
import { audit, type Principal } from "./principal";
import { messageAccess } from "./inbox";
import { RelayError, codeOf } from "../shared/errors";

export type ReplayResult =
  | { outcome: "inserted"; messageId: string }
  | { outcome: "duplicate"; messageId: string }
  | { outcome: "failed"; error: string };

export async function listFailures(env: Env, p: Principal) {
  const { inbound } = await messageAccess(env, p);
  return clientFor(env, p.workspaceId).listInboundFailures(p.workspaceId, inbound);
}

export async function replayFailure(env: Env, p: Principal, id: string): Promise<ReplayResult> {
  const stub = clientFor(env, p.workspaceId);
  const failure = await stub.getInboundFailure(p.workspaceId, id);
  if (!failure) throw new RelayError("not found");
  if (!failure.appId || !failure.addressId) throw new RelayError("cannot replay");
  const [inbox] = await coreDb(env)
    .select({ id: address.id })
    .from(address)
    .where(
      and(eq(address.id, failure.addressId), eq(address.workspaceId, p.workspaceId), eq(address.appId, failure.appId)),
    );
  if (!inbox) throw new RelayError("address removed");
  const job: InboundJob = {
    workspaceId: p.workspaceId,
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
    result = await stub.ingestInbound(p.workspaceId, job);
  } catch (err) {
    if (codeOf(err) === "raw mail missing") throw new RelayError("raw letter missing");
    throw err;
  }
  if (result.outcome === "inserted") await bumpUsage(env, p.workspaceId, utcDay(failure.receivedAt), { inbound: 1 });
  if (result.outcome === "duplicate") await stub.deleteInboundFailure(p.workspaceId, id);
  await audit(env, p, "inbound_failure.replay", id, { outcome: result.outcome });
  return result.outcome === "failed"
    ? { outcome: "failed", error: result.error }
    : { outcome: result.outcome, messageId: result.messageId };
}

export async function deleteFailure(env: Env, p: Principal, id: string): Promise<void> {
  const removed = await clientFor(env, p.workspaceId).deleteInboundFailure(p.workspaceId, id);
  if (!removed) throw new RelayError("not found");
  await audit(env, p, "inbound_failure.delete", id);
}
