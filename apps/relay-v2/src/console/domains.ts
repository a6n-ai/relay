import { and, asc, count, eq, inArray, like, lt, ne, or } from "drizzle-orm";
import { createAddress, deleteAddress as deleteAddressRow, updateAddress as updateAddressRow } from "../core/addresses";
import { refreshWorkspaceLimits } from "../core/limits";
import { SES_CONFIG_SETS } from "../core/ses";
import { type SesIdentity, sesIdentityApi } from "../core/ses-identity";
import { getWorkspaceProfile, SELF_SERVE_DOMAIN_CAP } from "../core/workspace-profile";
import { coreDb } from "../db/core/client";
import { address, sendingDomain } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { app } from "../db/security/schema";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { type ConsoleActor, ConsoleError, uniqueViolation } from "./actor";
import { getApp } from "./apps";

type DomainStatus = "pending" | "verified" | "failed";

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// The URL host parser does the punycode; the character check keeps paths, ports and credentials out of it.
function normaliseDomain(raw: string): string {
  const candidate = raw.trim().toLowerCase().replace(/\.$/, "");
  if (/[\s/:@?#\\]/.test(candidate)) throw new ConsoleError(400, "invalid domain");
  let host: string;
  try {
    host = new URL(`http://${candidate}`).hostname;
  } catch {
    throw new ConsoleError(400, "invalid domain");
  }
  if (!HOSTNAME.test(host)) throw new ConsoleError(400, "invalid domain");
  return host;
}

function normaliseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || !/^[^\s@]+$/.test(email.slice(0, at))) throw new ConsoleError(400, "invalid address");
  return `${email.slice(0, at)}@${normaliseDomain(email.slice(at + 1))}`;
}

const statusOf = (identity: SesIdentity | null): DomainStatus => {
  if (identity?.verified && identity.dkimStatus === "SUCCESS") return "verified";
  if (identity?.dkimStatus === "FAILED") return "failed";
  return "pending";
};

// A domain claims its parents and subdomains too; the label boundary keeps badexample.com apart from example.com.
async function claimedByAnother(env: Env, workspaceId: string, domain: string): Promise<boolean> {
  const labels = domain.split(".");
  const parents = labels.map((_, i) => labels.slice(i).join("."));
  const [hit] = await coreDb(env)
    .select({ id: sendingDomain.id })
    .from(sendingDomain)
    .where(
      and(
        ne(sendingDomain.workspaceId, workspaceId),
        or(inArray(sendingDomain.domain, parents), like(sendingDomain.domain, `%.${domain}`)),
      ),
    );
  return hit !== undefined;
}

const dkimRecords = (domain: string, identity: SesIdentity | null) =>
  (identity?.dkimTokens ?? []).map((token) => ({
    type: "CNAME" as const,
    name: `${token}._domainkey.${domain}`,
    value: `${token}.dkim.amazonses.com`,
  }));

export async function listDomains(env: Env, actor: ConsoleActor) {
  const rows = await coreDb(env)
    .select()
    .from(sendingDomain)
    .where(eq(sendingDomain.workspaceId, actor.workspaceId))
    .orderBy(asc(sendingDomain.createdAt));
  const ses = sesIdentityApi(env);
  return Promise.all(
    rows.map(async (d) => {
      const identity = await ses.get(d.sesRegion, d.domain).catch(() => {
        console.error("ses identity read failed", d.id);
        return null;
      });
      return {
        id: d.id,
        domain: d.domain,
        sesRegion: d.sesRegion,
        status: d.status,
        dkimStatus: d.dkimStatus,
        records: dkimRecords(d.domain, identity),
      };
    }),
  );
}

export async function addDomain(env: Env, actor: ConsoleActor, input: { domain: string; sesRegion?: string }): Promise<{ id: string }> {
  const domain = normaliseDomain(input.domain);
  const profile = await getWorkspaceProfile(env, actor.workspaceId);
  const sesRegion = input.sesRegion ?? profile.defaultSesRegion;
  if (!Object.hasOwn(SES_CONFIG_SETS, sesRegion)) throw new ConsoleError(400, "unknown region");
  if (sesRegion !== profile.defaultSesRegion && !actor.platformAdmin) throw new ConsoleError(403, "forbidden");

  const ses = sesIdentityApi(env);
  if (!actor.platformAdmin) {
    if (profile.selfServe) {
      // shortcut: parallel addDomain calls can all pass this count and exceed the cap, add an atomic check if abuse appears
      const [{ n }] = await coreDb(env).select({ n: count() }).from(sendingDomain).where(eq(sendingDomain.workspaceId, actor.workspaceId));
      if (n >= SELF_SERVE_DOMAIN_CAP) throw new ConsoleError(409, "domain limit reached");
    }
    if (await claimedByAnother(env, actor.workspaceId, domain)) throw new ConsoleError(409, "domain claimed");
    // An identity can sit in any region of the shared SES account, so a squat elsewhere is still a claim.
    for (const region of Object.keys(SES_CONFIG_SETS)) {
      if (await ses.get(region, domain)) throw new ConsoleError(409, "domain registered");
    }
  }

  // The row goes in first so two concurrent claims meet the unique index, not two SES identities.
  let row: { id: string };
  try {
    [row] = await coreDb(env)
      .insert(sendingDomain)
      .values({ workspaceId: actor.workspaceId, domain, sesRegion })
      .returning({ id: sendingDomain.id });
  } catch (err) {
    if (uniqueViolation(err, "sending_domain.domain")) throw new ConsoleError(409, "domain claimed");
    throw err;
  }

  const removeRow = () => coreDb(env).delete(sendingDomain).where(eq(sendingDomain.id, row.id));
  let alreadyExists: boolean;
  try {
    ({ alreadyExists } = await ses.create(sesRegion, domain));
  } catch (err) {
    await removeRow();
    throw err;
  }
  if (alreadyExists) {
    if (!actor.platformAdmin) {
      await removeRow();
      throw new ConsoleError(409, "domain registered");
    }
    // Adopting an identity that already exists: read its real state now instead of waiting for Check now.
    await checkDomain(env, actor, row.id);
  }
  await refreshWorkspaceLimits(env, actor.workspaceId);
  return row;
}

export async function checkDomain(env: Env, actor: ConsoleActor, id: string): Promise<{ status: DomainStatus; dkimStatus: string }> {
  const [row] = await coreDb(env)
    .select()
    .from(sendingDomain)
    .where(and(eq(sendingDomain.id, id), eq(sendingDomain.workspaceId, actor.workspaceId)));
  if (!row) throw new ConsoleError(404, "not found");

  const identity = await sesIdentityApi(env).get(row.sesRegion, row.domain);
  const status = statusOf(identity);
  const dkimStatus = (identity?.dkimStatus ?? "NOT_STARTED").toLowerCase();
  await coreDb(env).update(sendingDomain).set({ status, dkimStatus, updatedAt: new Date() }).where(eq(sendingDomain.id, id));
  if (status !== row.status) await refreshWorkspaceLimits(env, actor.workspaceId);
  return { status, dkimStatus };
}

export async function listAddresses(env: Env, actor: ConsoleActor) {
  const [rows, apps] = await Promise.all([
    coreDb(env)
      .select({
        id: address.id,
        appId: address.appId,
        email: address.email,
        kind: address.kind,
        displayName: address.displayName,
        canSend: address.canSend,
      })
      .from(address)
      .where(eq(address.workspaceId, actor.workspaceId))
      .orderBy(asc(address.createdAt)),
    securityDb(env).select({ id: app.id, name: app.name }).from(app).where(eq(app.workspaceId, actor.workspaceId)),
  ]);
  const names = new Map(apps.map((a) => [a.id, a.name]));
  return rows.map((r) => ({ ...r, appName: names.get(r.appId) ?? "Unknown app" }));
}

export async function addAddress(
  env: Env,
  actor: ConsoleActor,
  input: { appId: string; email: string; kind: "inbox" | "sender" | "both"; displayName?: string; canSend?: boolean },
): Promise<{ id: string }> {
  await getApp(env, actor, input.appId);
  const email = normaliseEmail(input.email);
  const [owned] = await coreDb(env)
    .select({ status: sendingDomain.status })
    .from(sendingDomain)
    .where(and(eq(sendingDomain.workspaceId, actor.workspaceId), eq(sendingDomain.domain, email.slice(email.indexOf("@") + 1))));
  if (!owned) throw new ConsoleError(400, "address must use one of your domains");
  // A sender can go out before its domain verifies; anything received or read as a mailbox needs the domain verified.
  if (!actor.platformAdmin && input.kind !== "sender" && owned.status !== "verified") {
    throw new ConsoleError(409, "domain not verified");
  }

  let row: { id: string };
  try {
    row = await createAddress(env, { ...input, workspaceId: actor.workspaceId, email });
  } catch (err) {
    if (uniqueViolation(err, "address.email")) throw new ConsoleError(409, "address already exists");
    throw err;
  }
  await refreshWorkspaceLimits(env, actor.workspaceId);
  return row;
}

export async function updateAddress(
  env: Env,
  actor: ConsoleActor,
  id: string,
  patch: { displayName?: string | null; canSend?: boolean },
): Promise<void> {
  if (!(await updateAddressRow(env, actor.workspaceId, id, patch))) throw new ConsoleError(404, "not found");
  await refreshWorkspaceLimits(env, actor.workspaceId);
}

export async function removeAddress(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  if (!(await deleteAddressRow(env, actor.workspaceId, id))) throw new ConsoleError(404, "not found");
  await refreshWorkspaceLimits(env, actor.workspaceId);
}

const PENDING_RELEASE_MS = 14 * 24 * 60 * 60 * 1000;

type DomainRow = { id: string; workspaceId: string; domain: string; sesRegion: string };

// Returns false when the row is no longer pending or still has addresses, so nothing is orphaned.
// The SES identity delete is best-effort: a leftover identity keeps the name taken (409) until removed by hand.
async function releasePendingRow(env: Env, row: DomainRow, actorUserId: string | null): Promise<boolean> {
  const [{ n }] = await coreDb(env).select({ n: count() }).from(address).where(like(address.email, `%@${row.domain}`));
  if (n > 0) return false;
  const gone = await coreDb(env)
    .delete(sendingDomain)
    .where(and(eq(sendingDomain.id, row.id), eq(sendingDomain.status, "pending")))
    .returning({ id: sendingDomain.id });
  if (gone.length === 0) return false;
  await sesIdentityApi(env)
    .delete(row.sesRegion, row.domain)
    .catch(() => console.error("ses identity delete failed", row.id));
  await writeAudit(env, { action: "domain.release", actorUserId, workspaceId: row.workspaceId, target: row.id });
  await refreshWorkspaceLimits(env, row.workspaceId);
  return true;
}

// Verified domains are never released here: only a row still pending past the cutoff goes.
export async function releaseStalePendingDomains(env: Env, now = Date.now()): Promise<number> {
  const stale = await coreDb(env)
    .select({ id: sendingDomain.id, workspaceId: sendingDomain.workspaceId, domain: sendingDomain.domain, sesRegion: sendingDomain.sesRegion })
    .from(sendingDomain)
    .where(and(eq(sendingDomain.status, "pending"), lt(sendingDomain.createdAt, new Date(now - PENDING_RELEASE_MS))));
  let released = 0;
  for (const row of stale) if (await releasePendingRow(env, row, null)) released++;
  return released;
}

export async function releaseDomain(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  if (!actor.platformAdmin) throw new ConsoleError(403, "forbidden");
  const [row] = await coreDb(env)
    .select({ id: sendingDomain.id, workspaceId: sendingDomain.workspaceId, domain: sendingDomain.domain, sesRegion: sendingDomain.sesRegion, status: sendingDomain.status })
    .from(sendingDomain)
    .where(eq(sendingDomain.id, id));
  if (!row) throw new ConsoleError(404, "not found");
  if (row.status !== "pending" || !(await releasePendingRow(env, row, actor.userId))) {
    throw new ConsoleError(409, "domain cannot be released");
  }
}
