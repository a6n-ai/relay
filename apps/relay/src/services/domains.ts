import { and, asc, count, eq, getTableColumns, inArray, like, ne, or } from "drizzle-orm";
import { createAddress, deleteAddress as deleteAddressRow, updateAddress as updateAddressRow } from "../core/addresses";
import { domainStateOf, releasableFlag, sesRead, type DomainStatus } from "../core/sending-domain";
import { releasePendingRow } from "./domain-state";
import { refreshWorkspaceLimits } from "./limits";
import { isSesRegion, SES_REGION_IDS } from "../shared/regions";
import { type SesIdentity, sesIdentityApi } from "../core/ses-identity";
import { getWorkspaceProfile, SELF_SERVE_DOMAIN_CAP } from "../core/workspace-profile";
import { isProtectedDomain } from "../core/protected-domains";
import { coreDb } from "../db/core/client";
import { address, sendingDomain } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { app } from "../db/security/schema";
import type { Env } from "../env";
import { writeAudit } from "../auth/audit";
import { uniqueViolation } from "../auth/session";
import type { Principal } from "./principal";
import { getApp } from "./apps";
import { RelayError } from "../shared/errors";

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// The URL host parser does the punycode; the character check keeps paths, ports and credentials out of it.
function normaliseDomain(raw: string): string {
  const candidate = raw.trim().toLowerCase().replace(/\.$/, "");
  if (/[\s/:@?#\\]/.test(candidate)) throw new RelayError("invalid domain");
  let host: string;
  try {
    host = new URL(`http://${candidate}`).hostname;
  } catch {
    throw new RelayError("invalid domain");
  }
  if (!HOSTNAME.test(host)) throw new RelayError("invalid domain");
  return host;
}

function normaliseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || !/^[^\s@]+$/.test(email.slice(0, at))) throw new RelayError("invalid address");
  return `${email.slice(0, at)}@${normaliseDomain(email.slice(at + 1))}`;
}

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

export const dkimRecords = (domain: string, identity: SesIdentity | null) =>
  (identity?.dkimTokens ?? []).map((token) => ({
    type: "CNAME" as const,
    name: `${token}._domainkey.${domain}`,
    value: `${token}.dkim.amazonses.com`,
  }));

export async function listDomains(env: Env, p: Principal) {
  const rows = await coreDb(env)
    .select({ ...getTableColumns(sendingDomain), releasable: releasableFlag })
    .from(sendingDomain)
    .where(eq(sendingDomain.workspaceId, p.workspaceId))
    .orderBy(asc(sendingDomain.createdAt));
  return Promise.all(
    rows.map(async (d) => {
      const identity = await sesRead.logAndAssumeUnknown(env, d.sesRegion, d.domain, d.id);
      return {
        id: d.id,
        domain: d.domain,
        sesRegion: d.sesRegion,
        status: d.status,
        dkimStatus: d.dkimStatus,
        protected: d.protected,
        releasable: d.releasable,
        records: dkimRecords(d.domain, identity),
      };
    }),
  );
}

export async function addDomain(env: Env, p: Principal, input: { domain: string; sesRegion?: string }): Promise<{ id: string }> {
  const domain = normaliseDomain(input.domain);
  const profile = await getWorkspaceProfile(env, p.workspaceId);
  const sesRegion = input.sesRegion ?? profile.defaultSesRegion;
  if (!isSesRegion(sesRegion)) throw new RelayError("unknown region");
  if (sesRegion !== profile.defaultSesRegion && !p.platformAdmin) throw new RelayError("forbidden");

  const ses = sesIdentityApi(env);
  if (!p.platformAdmin) {
    if (profile.selfServe) {
      // shortcut: parallel addDomain calls can all pass this count and exceed the cap, add an atomic check if abuse appears
      const [{ n }] = await coreDb(env).select({ n: count() }).from(sendingDomain).where(eq(sendingDomain.workspaceId, p.workspaceId));
      if (n >= SELF_SERVE_DOMAIN_CAP) throw new RelayError("domain limit reached");
    }
    if (await claimedByAnother(env, p.workspaceId, domain)) throw new RelayError("domain claimed");
    // An identity can sit in any region of the shared SES account, so a squat elsewhere is still a claim.
    for (const region of SES_REGION_IDS) {
      if (await sesRead.failClosed(env, region, domain)) throw new RelayError("domain registered");
    }
  }

  // The row goes in first so two concurrent claims meet the unique index, not two SES identities.
  let row: { id: string };
  try {
    [row] = await coreDb(env)
      .insert(sendingDomain)
      .values({ workspaceId: p.workspaceId, domain, sesRegion, protected: isProtectedDomain(env, domain) })
      .returning({ id: sendingDomain.id });
  } catch (err) {
    if (uniqueViolation(err, "sending_domain.domain")) throw new RelayError("domain claimed");
    throw err;
  }

  const removeRow = () => coreDb(env).delete(sendingDomain).where(eq(sendingDomain.id, row.id));
  let alreadyExists: boolean;
  try {
    // A platform admin adopting an identity needs only read access: Create is behind EnableSelfServeIdentities.
    const existing = p.platformAdmin ? await sesRead.failClosed(env, sesRegion, domain) : null;
    ({ alreadyExists } = existing ? { alreadyExists: true } : await ses.create(sesRegion, domain));
  } catch (err) {
    await removeRow();
    throw err;
  }
  if (!alreadyExists) {
    await coreDb(env).update(sendingDomain).set({ createdByRelay: true }).where(eq(sendingDomain.id, row.id));
  } else {
    if (!p.platformAdmin) {
      await removeRow();
      throw new RelayError("domain registered");
    }
    // Adopting an identity that already exists: read its real state now instead of waiting for Check now.
    await checkDomain(env, p, row.id);
  }
  await refreshWorkspaceLimits(env, p.workspaceId);
  return row;
}

export async function checkDomain(env: Env, p: Principal, id: string): Promise<{ status: DomainStatus; dkimStatus: string }> {
  const [row] = await coreDb(env)
    .select()
    .from(sendingDomain)
    .where(and(eq(sendingDomain.id, id), eq(sendingDomain.workspaceId, p.workspaceId)));
  if (!row) throw new RelayError("not found");

  const { status, dkimStatus } = domainStateOf(await sesRead.failClosed(env, row.sesRegion, row.domain));
  await coreDb(env)
    .update(sendingDomain)
    .set({ status, dkimStatus, updatedAt: new Date(), ...(status === "verified" && !row.verifiedAt ? { verifiedAt: new Date() } : {}) })
    .where(eq(sendingDomain.id, id));
  if (status !== row.status) await refreshWorkspaceLimits(env, p.workspaceId);
  return { status, dkimStatus };
}

export async function listAddresses(env: Env, p: Principal) {
  const [rows, apps] = await Promise.all([
    coreDb(env)
      .select({
        id: address.id,
        appId: address.appId,
        email: address.email,
        kind: address.kind,
        displayName: address.displayName,
        replyTo: address.replyTo,
        canSend: address.canSend,
      })
      .from(address)
      .where(eq(address.workspaceId, p.workspaceId))
      .orderBy(asc(address.createdAt)),
    securityDb(env).select({ id: app.id, name: app.name }).from(app).where(eq(app.workspaceId, p.workspaceId)),
  ]);
  const names = new Map(apps.map((a) => [a.id, a.name]));
  return rows.map((r) => ({ ...r, appName: names.get(r.appId) ?? "Unknown app" }));
}

export async function addAddress(
  env: Env,
  p: Principal,
  input: { appId: string; email: string; kind: "inbox" | "sender" | "both"; displayName?: string; replyTo?: string | null },
): Promise<{ id: string }> {
  await getApp(env, p, input.appId);
  const email = normaliseEmail(input.email);
  const [owned] = await coreDb(env)
    .select({ status: sendingDomain.status })
    .from(sendingDomain)
    .where(and(eq(sendingDomain.workspaceId, p.workspaceId), eq(sendingDomain.domain, email.slice(email.indexOf("@") + 1))));
  if (!owned) throw new RelayError("address must use one of your domains");
  // A sender can go out before its domain verifies; anything received or read as a mailbox needs the domain verified.
  if (!p.platformAdmin && input.kind !== "sender" && owned.status !== "verified") {
    throw new RelayError("domain not verified");
  }

  let row: { id: string };
  try {
    row = await createAddress(env, { ...input, canSend: input.kind !== "inbox", workspaceId: p.workspaceId, email });
  } catch (err) {
    if (uniqueViolation(err, "address.email")) throw new RelayError("address already exists");
    throw err;
  }
  await refreshWorkspaceLimits(env, p.workspaceId);
  return row;
}

export async function updateAddress(
  env: Env,
  p: Principal,
  id: string,
  patch: { displayName?: string | null; replyTo?: string | null },
): Promise<void> {
  // Sending follows kind, so canSend is never taken from the caller.
  const { displayName, replyTo } = patch;
  if (!(await updateAddressRow(env, p.workspaceId, id, { displayName, replyTo }))) throw new RelayError("not found");
  await refreshWorkspaceLimits(env, p.workspaceId);
}

export async function removeAddress(env: Env, p: Principal, id: string): Promise<void> {
  const [row] = await coreDb(env).select({ kind: address.kind }).from(address).where(and(eq(address.id, id), eq(address.workspaceId, p.workspaceId)));
  if (row?.kind === "personal") throw new RelayError("personal mailbox");
  if (!(await deleteAddressRow(env, p.workspaceId, id))) throw new RelayError("not found");
  await refreshWorkspaceLimits(env, p.workspaceId);
}

export async function releaseDomain(env: Env, p: Principal, id: string): Promise<void> {
  if (!p.platformAdmin) throw new RelayError("forbidden");
  const [row] = await coreDb(env)
    .select({
      id: sendingDomain.id,
      workspaceId: sendingDomain.workspaceId,
      domain: sendingDomain.domain,
      sesRegion: sendingDomain.sesRegion,
      protected: sendingDomain.protected,
    })
    .from(sendingDomain)
    .where(eq(sendingDomain.id, id));
  if (!row) throw new RelayError("not found");
  if (row.protected) throw new RelayError("domain is protected");
  if (!(await releasePendingRow(env, row, p.userId))) {
    throw new RelayError("domain cannot be released");
  }
}

// Protection is the only guard on a live domain's rows: the sweep, release and delete paths all check it.
export async function setDomainProtected(env: Env, p: Principal, id: string, protectedNow: boolean): Promise<void> {
  if (!p.platformAdmin) throw new RelayError("forbidden");
  const [row] = await coreDb(env)
    .update(sendingDomain)
    .set({ protected: protectedNow, updatedAt: new Date() })
    .where(eq(sendingDomain.id, id))
    .returning({ workspaceId: sendingDomain.workspaceId });
  if (!row) throw new RelayError("not found");
  await writeAudit(env, {
    action: protectedNow ? "domain.protect" : "domain.unprotect",
    actorUserId: p.userId,
    workspaceId: row.workspaceId,
    target: id,
  });
}

export async function domainRow(env: Env, id: string) {
  const [row] = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.id, id));
  if (!row) throw new RelayError("not found");
  return row;
}
