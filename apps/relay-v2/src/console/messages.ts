import { and, eq, inArray, or } from "drizzle-orm";
import { clientFor } from "../core/messages";
import { decodeCursor, type MessageAccess, type MessageDetail, type MessageQuery } from "../do/console-reads";
import { securityDb } from "../db/security/client";
import { addressGrant, member, team, teamMember } from "../db/security/schema";
import type { Env } from "../env";
import { allows } from "../lib/auth/permissions";
import { ConsoleError, type ConsoleActor } from "./actor";

export type ConsoleMessage = Omit<MessageDetail, "html" | "htmlKey" | "rawKey" | "claimedUntil" | "idempotencyKey"> & {
  htmlSafe: string | null;
  blockedRemote: number;
  hasRaw: boolean;
};

export async function messageAccess(env: Env, actor: ConsoleActor): Promise<MessageAccess> {
  const out = allows(actor.roles, { log: ["read"] });
  if (allows(actor.roles, { mailbox: ["manage"] })) return { out, inbound: "all" };
  if (!allows(actor.roles, { mailbox: ["read"] })) return { out, inbound: [] };
  return { out, inbound: await grantedAddressIds(env, actor) };
}

// Plain queries, no subquery: the member row, then the user's teams in this workspace, then the grants that name either.
async function grantedAddressIds(env: Env, actor: ConsoleActor): Promise<string[]> {
  const db = securityDb(env);
  const [self] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, actor.workspaceId), eq(member.userId, actor.userId)));
  const teams = await db
    .select({ id: teamMember.teamId })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, actor.userId), eq(team.organizationId, actor.workspaceId)));
  // Without a grantee, the workspace filter alone would match every grant in it.
  if (!self && teams.length === 0) return [];
  const grantee = or(
    self ? eq(addressGrant.memberId, self.id) : undefined,
    teams.length > 0 ? inArray(addressGrant.teamId, teams.map((t) => t.id)) : undefined,
  );
  const rows = await db
    .select({ addressId: addressGrant.addressId })
    .from(addressGrant)
    .where(and(eq(addressGrant.workspaceId, actor.workspaceId), grantee));
  return [...new Set(rows.map((r) => r.addressId))];
}

export async function listMessagesFor(env: Env, actor: ConsoleActor, q: MessageQuery) {
  const access = await messageAccess(env, actor);
  const inboundAllowed = allows(actor.roles, { mailbox: ["read"] });
  if (q.direction === "out" ? !access.out : !inboundAllowed) throw new ConsoleError(403, "forbidden");
  if (q.cursor !== undefined && !decodeCursor(q.cursor)) throw new ConsoleError(400, "invalid cursor");
  const page = await clientFor(env, actor.workspaceId).listMessages(
    actor.workspaceId,
    { ...q, email: q.email?.trim().toLowerCase() || undefined },
    access,
  );
  return { ...page, restricted: Array.isArray(access.inbound) };
}

// A letter the reader may not see is a 404, the same as one that does not exist.
export async function getMessageFor(
  env: Env,
  actor: ConsoleActor,
  id: string,
  opts: { images: boolean },
): Promise<ConsoleMessage> {
  const access = await messageAccess(env, actor);
  const view = await clientFor(env, actor.workspaceId).getMessageDetail(actor.workspaceId, id, access);
  if (!view) throw new ConsoleError(404, "not found");
  const { html, htmlKey, rawKey, claimedUntil, idempotencyKey, ...rest } = view;
  return { ...rest, htmlSafe: null, blockedRemote: 0, hasRaw: rawKey !== null };
}
