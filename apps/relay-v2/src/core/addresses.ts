import { and, eq, inArray } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { addressGrant, app, member, team } from "../db/security/schema";
import type { Env } from "../env";

// relay-core and relay-security cannot foreign-key each other, so these checks are the only guard on those ids.
export async function createAddress(
  env: Env,
  input: { workspaceId: string; appId: string; email: string; kind: "inbox" | "sender" | "both"; displayName?: string; canSend?: boolean },
): Promise<{ id: string }> {
  const [owner] = await securityDb(env)
    .select({ id: app.id })
    .from(app)
    .where(and(eq(app.id, input.appId), eq(app.workspaceId, input.workspaceId)));
  if (!owner) throw new Error("app does not belong to workspace");
  const [row] = await coreDb(env)
    .insert(address)
    .values({ ...input, email: input.email.trim().toLowerCase() })
    .returning({ id: address.id });
  return row;
}

export async function createAddressGrant(
  env: Env,
  input: { workspaceId: string; addressId: string; memberId?: string; teamId?: string },
): Promise<void> {
  if (Boolean(input.memberId) === Boolean(input.teamId)) throw new Error("exactly one grantee required");
  const [target] = await coreDb(env)
    .select({ workspaceId: address.workspaceId })
    .from(address)
    .where(eq(address.id, input.addressId));
  if (target?.workspaceId !== input.workspaceId) throw new Error("address does not belong to workspace");
  const [grantee] = input.memberId
    ? await securityDb(env).select({ workspaceId: member.organizationId }).from(member).where(eq(member.id, input.memberId))
    : await securityDb(env).select({ workspaceId: team.organizationId }).from(team).where(eq(team.id, input.teamId ?? ""));
  if (grantee?.workspaceId !== input.workspaceId) throw new Error("grantee does not belong to workspace");
  await securityDb(env)
    .insert(addressGrant)
    .values({ workspaceId: input.workspaceId, addressId: input.addressId, memberId: input.memberId ?? null, teamId: input.teamId ?? null });
}

export async function updateAddress(
  env: Env,
  workspaceId: string,
  id: string,
  patch: { displayName?: string | null; canSend?: boolean },
): Promise<boolean> {
  const rows = await coreDb(env)
    .update(address)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(address.id, id), eq(address.workspaceId, workspaceId)))
    .returning({ id: address.id });
  return rows.length > 0;
}

// Grants live in relay-security, so they go first: a failure leaves an address without grants, never a grant to a missing address.
export async function deleteAddress(env: Env, workspaceId: string, id: string): Promise<boolean> {
  const [owned] = await coreDb(env)
    .select({ id: address.id })
    .from(address)
    .where(and(eq(address.id, id), eq(address.workspaceId, workspaceId)));
  if (!owned) return false;
  await securityDb(env).delete(addressGrant).where(and(eq(addressGrant.addressId, id), eq(addressGrant.workspaceId, workspaceId)));
  await coreDb(env).delete(address).where(eq(address.id, id));
  return true;
}

export async function inboxForRecipient(
  env: Env,
  email: string,
): Promise<{ addressId: string; workspaceId: string; appId: string } | null> {
  const [row] = await coreDb(env)
    .select({ addressId: address.id, workspaceId: address.workspaceId, appId: address.appId })
    .from(address)
    .where(and(eq(address.email, email.trim().toLowerCase()), inArray(address.kind, ["inbox", "both"])));
  return row ?? null;
}
