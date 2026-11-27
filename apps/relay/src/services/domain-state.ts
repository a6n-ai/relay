import { and, count, eq, isNull, like, lt } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address, sendingDomain } from "../db/core/schema";
import { type SesIdentity, sesIdentityApi } from "../core/ses-identity";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { refreshWorkspaceLimits } from "./limits";

export type DomainStatus = "pending" | "verified" | "failed";

export const statusOf = (identity: SesIdentity | null): DomainStatus => {
  if (identity?.verified && identity.dkimStatus === "SUCCESS") return "verified";
  if (identity?.dkimStatus === "FAILED") return "failed";
  return "pending";
};

// The real SES state of an identity, for rows that start from an identity Relay did not create (seed, adopt).
export async function readDomainState(env: Env, region: string, domain: string) {
  const identity = await sesIdentityApi(env).get(region, domain).catch(() => null);
  return { status: statusOf(identity), dkimStatus: (identity?.dkimStatus ?? "NOT_STARTED").toLowerCase() };
}

const PENDING_RELEASE_MS = 14 * 24 * 60 * 60 * 1000;

type DomainRow = { id: string; workspaceId: string; domain: string; sesRegion: string };

// Returns false when the row is not releasable, still has addresses, or SES now reports it verified, so nothing is orphaned.
// The SES identity delete is best-effort: a leftover identity keeps the name taken (409) until removed by hand.
export async function releasePendingRow(env: Env, row: DomainRow, actorUserId: string | null): Promise<boolean> {
  const [{ n }] = await coreDb(env).select({ n: count() }).from(address).where(like(address.email, `%@${row.domain}`));
  if (n > 0) return false;
  const ses = sesIdentityApi(env);
  // A failed read counts as "do not delete": an identity we cannot see may be verified.
  const identity = await ses.get(row.sesRegion, row.domain).catch(() => ({ verified: true }));
  if (identity?.verified) return false;
  const gone = await coreDb(env)
    .delete(sendingDomain)
    .where(
      and(
        eq(sendingDomain.id, row.id),
        eq(sendingDomain.status, "pending"),
        eq(sendingDomain.createdByRelay, true),
        isNull(sendingDomain.verifiedAt),
        eq(sendingDomain.protected, false),
      ),
    )
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
    .where(
      and(
        eq(sendingDomain.status, "pending"),
        eq(sendingDomain.createdByRelay, true),
        isNull(sendingDomain.verifiedAt),
        eq(sendingDomain.protected, false),
        lt(sendingDomain.createdAt, new Date(now - PENDING_RELEASE_MS)),
      ),
    );
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
