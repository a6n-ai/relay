import { inChunks } from "../core/chunks";
import { and, eq, inArray } from "drizzle-orm";
import { clearDefaultSenders } from "../core/addresses";
import { refreshWorkspaceLimits } from "./limits";
import { clientFor } from "../do/client";
import { sesIdentityApi } from "../core/ses-identity";
import { onDomain, sesRead } from "../core/sending-domain";
import { coreDb } from "../db/core/client";
import { address, sendingDomain } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { addressGrant } from "../db/security/schema";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { type ConsoleActor } from "../core/session";
import { dkimRecords, domainRow } from "./domains";
import { RelayError } from "../shared/errors";

const ownerCommand = (d: { sesRegion: string; domain: string }) =>
  `aws sesv2 delete-email-identity --region ${d.sesRegion} --email-identity ${d.domain}`;

// Relay deletes an SES identity only when it created the identity and the domain is not protected.
const deletesSesIdentity = (d: { createdByRelay: boolean; protected: boolean }) => d.createdByRelay && !d.protected;

async function addressesOf(env: Env, workspaceId: string, domain: string) {
  return coreDb(env)
    .select({ id: address.id, kind: address.kind })
    .from(address)
    .where(and(eq(address.workspaceId, workspaceId), onDomain(domain)));
}

// Grants sit in relay-security, so they are looked up by the address ids that core returned.
async function grantIdsOf(env: Env, workspaceId: string, addressIds: string[]): Promise<string[]> {
  const found = await inChunks(addressIds, (part) =>
    securityDb(env)
      .select({ id: addressGrant.id })
      .from(addressGrant)
      .where(and(eq(addressGrant.workspaceId, workspaceId), inArray(addressGrant.addressId, part))),
  );
  return found.flat().map((r) => r.id);
}

export async function domainDeletePreview(env: Env, actor: ConsoleActor, id: string) {
  if (!actor.platformAdmin) throw new RelayError("forbidden");
  const row = await domainRow(env, id);
  const addresses = await addressesOf(env, row.workspaceId, row.domain);
  const [grants, usage, identity] = await Promise.all([
    grantIdsOf(env, row.workspaceId, addresses.map((a) => a.id)),
    clientFor(env, row.workspaceId).domainUsage(row.workspaceId, row.domain),
    sesRead.assumeUnknown(env, row.sesRegion, row.domain),
  ]);
  const sesDelete = deletesSesIdentity(row);
  return {
    domain: row.domain,
    protected: row.protected,
    addresses: {
      total: addresses.length,
      senders: addresses.filter((a) => a.kind !== "inbox").length,
      inboxes: addresses.filter((a) => a.kind !== "sender").length,
    },
    grants: grants.length,
    campaigns: usage.campaigns,
    automations: usage.automations,
    messages: usage.messages,
    dnsRecords: dkimRecords(row.domain, identity),
    sesDelete,
    ownerCommand: sesDelete ? null : ownerCommand(row),
  };
}

// Suppressions, marketing opt-outs and audit rows stay: they are the legal record. Mail history goes only when asked for.
export async function deleteDomain(
  env: Env,
  actor: ConsoleActor,
  id: string,
  input: { confirm: string; deleteHistory: boolean },
): Promise<{ ownerCommand: string | null }> {
  if (!actor.platformAdmin) throw new RelayError("forbidden");
  const row = await domainRow(env, id);
  if (input.confirm !== row.domain) throw new RelayError("domain name does not match");

  // SES goes first and an error aborts: the row stays so a retry works (a 404 counts as deleted), and no identity is orphaned.
  const sesDelete = deletesSesIdentity(row);
  if (sesDelete) await sesIdentityApi(env).delete(row.sesRegion, row.domain);

  const addressIds = (await addressesOf(env, row.workspaceId, row.domain)).map((a) => a.id);
  const grantIds = await grantIdsOf(env, row.workspaceId, addressIds);
  const client = clientFor(env, row.workspaceId);
  // Pausing runs first: if it fails nothing else has changed, so the owner can retry.
  const detached = await client.detachDomain(row.workspaceId, row.domain);
  const history = input.deleteHistory ? await client.deleteDomainHistory(row.workspaceId, row.domain) : null;
  // Grants before addresses: a failure leaves an address without grants, never a grant to a missing address.
  await inChunks(grantIds, (part) => securityDb(env).delete(addressGrant).where(inArray(addressGrant.id, part)));
  await inChunks(addressIds, (part) => clearDefaultSenders(env, row.workspaceId, part));
  await inChunks(addressIds, (part) => coreDb(env).delete(address).where(inArray(address.id, part)));
  await coreDb(env).delete(sendingDomain).where(eq(sendingDomain.id, row.id));

  await refreshWorkspaceLimits(env, row.workspaceId);
  await writeAudit(env, {
    action: row.protected ? "domain.delete_protected" : "domain.delete",
    actorUserId: actor.userId,
    workspaceId: row.workspaceId,
    target: row.id,
    data: {
      addressIds,
      grantIds,
      campaignIds: detached.campaigns,
      automationIds: detached.automations,
      historyDeleted: history !== null,
    },
  });
  return { ownerCommand: sesDelete ? null : ownerCommand(row) };
}
