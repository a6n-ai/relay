import { and, desc, eq } from "drizzle-orm";
import { closeMailboxes } from "../auth/hooks/org";
import { maskEmails } from "../core/mask-emails";
import { getWorkspaceProfile } from "../core/workspace-profile";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { member, user } from "../db/security/schema";
import type { Env } from "../env";
import { allows } from "../shared/permissions";
import { RelayError } from "../shared/errors";
import { audit, type Principal } from "./principal";
import { refreshWorkspaceLimits } from "./limits";

const MANAGE = { mailbox: ["manage"] } as const;

function requireManage(p: Principal) {
  if (!allows(p.roles ?? [], MANAGE)) throw new RelayError("forbidden");
}

async function personalRow(env: Env, p: Principal, id: string) {
  const [row] = await coreDb(env)
    .select({ id: address.id, email: address.email, ownerUserId: address.ownerUserId })
    .from(address)
    .where(and(eq(address.id, id), eq(address.workspaceId, p.workspaceId), eq(address.kind, "personal")));
  if (!row?.ownerUserId) throw new RelayError("not found");
  return { ...row, ownerUserId: row.ownerUserId };
}

export async function listPersonalMailboxes(env: Env, p: Principal) {
  requireManage(p);
  const rows = await coreDb(env)
    .select()
    .from(address)
    .where(and(eq(address.workspaceId, p.workspaceId), eq(address.kind, "personal")))
    .orderBy(desc(address.createdAt));
  const owners = await securityDb(env)
    .select({ id: user.id, name: user.name, recoveryEmail: user.recoveryEmail })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(member.organizationId, p.workspaceId));
  const byId = new Map(owners.map((o) => [o.id, o]));
  const canRead = (await getWorkspaceProfile(env, p.workspaceId)).adminsReadPersonal;
  return rows.map((a) => {
    const owner = a.ownerUserId ? byId.get(a.ownerUserId) : undefined;
    return {
      id: a.id,
      email: a.email,
      ownerName: owner?.name ?? "Former member",
      recoveryEmail: owner?.recoveryEmail ? maskEmails(owner.recoveryEmail) : null,
      closed: a.closedAt !== null,
      createdAt: a.createdAt.getTime(),
      canRead: canRead || a.ownerUserId === p.userId,
    };
  });
}

export async function closePersonalMailbox(env: Env, p: Principal, id: string): Promise<void> {
  requireManage(p);
  const row = await personalRow(env, p, id);
  await closeMailboxes(env, p.workspaceId, row.ownerUserId);
  await audit(env, p, "mailbox.close", id);
}

export async function reopenPersonalMailbox(env: Env, p: Principal, id: string): Promise<void> {
  requireManage(p);
  const row = await personalRow(env, p, id);
  const [m] = await securityDb(env)
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, p.workspaceId), eq(member.userId, row.ownerUserId)));
  if (!m) throw new RelayError("invalid input");
  await coreDb(env).update(address).set({ canSend: true, closedAt: null, updatedAt: new Date() }).where(eq(address.id, id));
  await refreshWorkspaceLimits(env, p.workspaceId);
  await audit(env, p, "mailbox.reopen", id);
}
