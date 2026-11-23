import { and, eq } from "drizzle-orm";
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
  const [target] = await coreDb(env)
    .select({ workspaceId: address.workspaceId })
    .from(address)
    .where(eq(address.id, input.addressId));
  if (target?.workspaceId !== input.workspaceId) throw new Error("address does not belong to workspace");
  const [grantee] = input.memberId
    ? await securityDb(env).select({ workspaceId: member.organizationId }).from(member).where(eq(member.id, input.memberId))
    : await securityDb(env).select({ workspaceId: team.organizationId }).from(team).where(eq(team.id, input.teamId ?? ""));
  if (grantee?.workspaceId !== input.workspaceId) throw new Error("grantee does not belong to workspace");
  await securityDb(env).insert(addressGrant).values(input);
}
