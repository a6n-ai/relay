import { and, count, eq, lt } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address, sendingDomain } from "../db/core/schema";
import { sesIdentityApi } from "../core/ses-identity";
import { domainStateOf, onDomain, releasableWhere, sesRead } from "../core/sending-domain";
import type { Env } from "../env";
import { writeAudit } from "../auth/audit";
import { refreshWorkspaceLimits } from "./limits";

// The real SES state of an identity, for rows that start from an identity Relay did not create (seed, adopt).
export async function readDomainState(env: Env, region: string, domain: string) {
  return domainStateOf(await sesRead.assumeUnknown(env, region, domain));
}

const PENDING_RELEASE_MS = 14 * 24 * 60 * 60 * 1000;

type DomainRow = { id: string; workspaceId: string; domain: string; sesRegion: string };

// Returns false when the row is not releasable, still has addresses, or SES now reports it verified, so nothing is orphaned.
// The SES identity delete is best-effort: a leftover identity keeps the name taken (409) until removed by hand.
export async function releasePendingRow(env: Env, row: DomainRow, actorUserId: string | null): Promise<boolean> {
  const [{ n }] = await coreDb(env).select({ n: count() }).from(address).where(onDomain(row.domain));
  if (n > 0) return false;
  const ses = sesIdentityApi(env);
  const identity = await sesRead.assumeVerified(env, row.sesRegion, row.domain);
  if (identity?.verified) return false;
  const gone = await coreDb(env)
    .delete(sendingDomain)
    .where(and(eq(sendingDomain.id, row.id), releasableWhere))
    .returning({ id: sendingDomain.id });
  if (gone.length === 0) return false;
  await ses.delete(row.sesRegion, row.domain).catch(() => console.error("ses identity delete failed", row.id));
  await writeAudit(env, { action: "domain.release", actorUserId, workspaceId: row.workspaceId, target: row.id });
  await refreshWorkspaceLimits(env, row.workspaceId);
  return true;
}

// Verified, seeded and adopted domains are never released here: only a row Relay created, never verified, still pending past the cutoff.
export async function releaseStalePendingDomains(env: Env, now = Date.now()): Promise<number> {
  const stale = await coreDb(env)
    .select({ id: sendingDomain.id, workspaceId: sendingDomain.workspaceId, domain: sendingDomain.domain, sesRegion: sendingDomain.sesRegion })
    .from(sendingDomain)
    .where(and(releasableWhere, lt(sendingDomain.createdAt, new Date(now - PENDING_RELEASE_MS))));
  let released = 0;
  for (const row of stale) {
    try {
      if (await releasePendingRow(env, row, null)) released++;
    } catch {
      console.error("domain release failed", row.id);
    }
  }
  return released;
}
