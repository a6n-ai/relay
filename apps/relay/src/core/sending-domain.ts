import { and, eq, isNull, like, sql } from "drizzle-orm";
import { address, sendingDomain } from "../db/core/schema";
import type { Env } from "../env";
import { describeError } from "./log";
import { type SesIdentity, sesIdentityApi } from "./ses-identity";

export type DomainStatus = "pending" | "verified" | "failed";

const domainStatusOf = (identity: SesIdentity | null): DomainStatus => {
  if (identity?.verified && identity.dkimStatus === "SUCCESS") return "verified";
  if (identity?.dkimStatus === "FAILED") return "failed";
  return "pending";
};

// The stored pair for an identity; null (no identity) reads as pending / not_started.
export const domainStateOf = (identity: SesIdentity | null) => ({
  status: domainStatusOf(identity),
  dkimStatus: (identity?.dkimStatus ?? "NOT_STARTED").toLowerCase(),
});

// What an unreadable SES identity means differs per call site, on purpose. Pick the policy by name:
export const sesRead = {
  // addDomain claim check and verify refresh: guessing would claim or mark the wrong thing, so the error propagates.
  failClosed: (env: Env, region: string, domain: string) => sesIdentityApi(env).get(region, domain),
  // Release: an identity we cannot see may be verified, so it is never deleted.
  assumeVerified: (env: Env, region: string, domain: string) =>
    sesIdentityApi(env).get(region, domain).catch((): Pick<SesIdentity, "verified"> => ({ verified: true })),
  // Seed and adopt rows, and the delete preview: the state is shown as unknown, which reads as pending.
  assumeUnknown: (env: Env, region: string, domain: string) => sesIdentityApi(env).get(region, domain).catch(() => null),
  // Domain list: the row stays visible without DNS records, and the failure is logged.
  logAndAssumeUnknown: (env: Env, region: string, domain: string, rowId: string) =>
    sesIdentityApi(env)
      .get(region, domain)
      .catch((err: unknown) => {
        console.error("ses identity read failed", rowId, describeError(err));
        return null;
      }),
};

// Only a row Relay created, never seen verified and still pending may be released along with its SES identity.
export const releasableWhere = and(
  eq(sendingDomain.status, "pending"),
  eq(sendingDomain.createdByRelay, true),
  isNull(sendingDomain.verifiedAt),
  eq(sendingDomain.protected, false),
);
export const releasableFlag = sql<boolean>`${releasableWhere}`.mapWith(Boolean);

// Stored addresses on a domain, matched by their email suffix (also used as the LIKE pattern in a workspace DO).
export const domainLikePattern = (domain: string) => `%@${domain}`;
export const onDomain = (domain: string) => like(address.email, domainLikePattern(domain));

// The send path and the campaign sender list both read senders as: an address whose domain is verified in the same workspace.
export const senderDomainJoin = and(
  eq(sendingDomain.workspaceId, address.workspaceId),
  eq(sendingDomain.domain, sql`substr(${address.email}, instr(${address.email}, '@') + 1)`),
);
export const verifiedSenderWhere = (workspaceId: string) =>
  and(eq(address.workspaceId, workspaceId), eq(address.canSend, true), eq(sendingDomain.status, "verified"));
