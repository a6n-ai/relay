import { and, asc, desc, eq } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address, sendingDomain } from "../db/core/schema";
import { createPersonalAddress } from "../core/addresses";
import { refreshWorkspaceLimits } from "./limits";
import { securityDb } from "../db/security/client";
import { app, invitation, member, team, teamMember, user, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { inviteCap, invitesInWindow } from "../core/workspace-profile";
import { createAuth } from "../auth";
import { mailboxFree } from "../core/mailbox-name";
import { authError } from "../auth/errors";
import { parseRoles } from "../auth/session";
import type { Principal, Session } from "./principal";
import { type ErrorCode, RelayError } from "../shared/errors";
import { type OrgRole } from "../shared/roles";
import { isSuspended } from "../shared/limits";

async function authCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw authError(err, "member");
  }
}

type InviteStatus = "pending" | "accepted" | "rejected" | "canceled" | "expired";

const INVITE_REFUSAL: Record<Exclude<InviteStatus, "pending">, ErrorCode> = {
  accepted: "invite accepted",
  rejected: "invite rejected",
  canceled: "invite canceled",
  expired: "invite expired",
};

// A status better-auth adds later reads as closed, so an invite is never accepted by accident.
const effectiveStatus = (i: { status: string; expiresAt: Date }): InviteStatus => {
  if (i.status === "pending") return i.expiresAt.getTime() < Date.now() ? "expired" : "pending";
  return Object.hasOwn(INVITE_REFUSAL, i.status) ? (i.status as InviteStatus) : "canceled";
};

export async function listPeople(env: Env, p: Principal) {
  const db = securityDb(env);
  const ws = p.workspaceId;
  const [rows, invites, teams, links] = await Promise.all([
    db
      .select({ id: member.id, userId: member.userId, role: member.role, email: user.email, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, ws))
      .orderBy(asc(member.createdAt)),
    db
      .select({ id: invitation.id, email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt })
      .from(invitation)
      .where(eq(invitation.organizationId, ws))
      .orderBy(desc(invitation.createdAt)),
    db.select({ id: team.id, name: team.name }).from(team).where(eq(team.organizationId, ws)).orderBy(asc(team.createdAt)),
    db
      .select({ teamId: teamMember.teamId, userId: teamMember.userId })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .where(eq(team.organizationId, ws)),
  ]);
  const memberByUser = new Map(rows.map((m) => [m.userId, m.id]));
  return {
    members: rows.map(({ role, ...m }) => ({ ...m, roles: parseRoles(role) })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role ?? "member",
      status: effectiveStatus(i),
      expiresAt: i.expiresAt.getTime(),
    })),
    teams: teams.map((t) => ({
      ...t,
      memberIds: links
        .filter((l) => l.teamId === t.id)
        .map((l) => memberByUser.get(l.userId))
        .filter((id): id is string => id !== undefined),
    })),
  };
}

export type InviteInput =
  | { kind?: "plain"; email: string; role: OrgRole }
  | { kind: "mailbox"; name: string; recoveryEmail: string; mailbox: string; appId: string; role: OrgRole };

// The mailbox must sit on one of this workspace's verified domains, with an app of this workspace.
async function checkMailboxTarget(env: Env, p: Principal, mailbox: string, appId: string): Promise<void> {
  const domain = mailbox.split("@")[1];
  const [dom] = await coreDb(env)
    .select({ id: sendingDomain.id })
    .from(sendingDomain)
    .where(and(eq(sendingDomain.domain, domain), eq(sendingDomain.workspaceId, p.workspaceId), eq(sendingDomain.status, "verified")));
  const [owned] = await securityDb(env)
    .select({ id: app.id })
    .from(app)
    .where(and(eq(app.id, appId), eq(app.workspaceId, p.workspaceId)));
  if (!dom || !owned) throw new RelayError("invalid input");
}

export async function inviteMember(env: Env, p: Principal, headers: Headers, input: InviteInput): Promise<{ id: string }> {
  if (input.role === "owner" && !p.roles?.includes("owner")) throw new RelayError("forbidden");
  // beforeCreateInvitation refuses at the cap; the recount below catches concurrent requests that all passed it.
  const cap = await inviteCap(env, p.workspaceId);
  const mailbox = input.kind === "mailbox" ? input : null;
  const email = (input.kind === "mailbox" ? input.mailbox : input.email).trim().toLowerCase();
  if (mailbox) {
    await checkMailboxTarget(env, p, email, mailbox.appId);
    if (!(await mailboxFree(env, email))) throw new RelayError("mailbox taken");
  }
  const auth = createAuth(env);
  const cancel = (invitationId: string) => authCall(() => auth.api.cancelInvitation({ headers, body: { invitationId } }));
  const { id } = await authCall(() => auth.api.createInvitation({
      headers,
      body: mailbox
        ? { email, role: input.role, recoveryEmail: mailbox.recoveryEmail.trim().toLowerCase(), mailboxName: mailbox.name, appId: mailbox.appId }
        : { email, role: input.role },
    }),
  );
  // Concurrent requests can all pass the count above. Recounting after the insert keeps live invites at or under the cap.
  if ((await invitesInWindow(env, p.workspaceId)) > cap) {
    await cancel(id);
    throw new RelayError("invite limit reached");
  }
  // Sign-up is disabled, so the invite is the only path that creates a row for a new email. Existing rows are left alone.
  try {
    await securityDb(env)
      .insert(user)
      .values({ name: mailbox?.name ?? email.split("@")[0], email, role: "user", emailVerified: false })
      .onConflictDoNothing({ target: user.email });
  } catch (err) {
    await cancel(id);
    throw err;
  }
  return { id };
}

export async function cancelInvite(env: Env, p: Principal, headers: Headers, id: string): Promise<void> {
  const [row] = await securityDb(env)
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, p.workspaceId)));
  if (!row) throw new RelayError("not found");
  await authCall(() => createAuth(env).api.cancelInvitation({ headers, body: { invitationId: id } }));
}

async function ownMember(env: Env, p: Principal, memberId: string) {
  const [row] = await securityDb(env)
    .select({ id: member.id, userId: member.userId, role: member.role })
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, p.workspaceId)));
  if (!row) throw new RelayError("not found");
  return { ...row, roles: parseRoles(row.role) };
}

export async function changeRole(env: Env, p: Principal, headers: Headers, memberId: string, role: OrgRole): Promise<void> {
  const target = await ownMember(env, p, memberId);
  const touchesOwner = role === "owner" || target.roles.includes("owner");
  if (touchesOwner && !p.roles?.includes("owner")) throw new RelayError("forbidden");
  await authCall(() => createAuth(env).api.updateMemberRole({ headers, body: { memberId, role } }));
}

// better-auth refuses removing the last owner; that refusal comes back as a 400.
export async function removeMember(env: Env, p: Principal, headers: Headers, memberId: string): Promise<void> {
  const target = await ownMember(env, p, memberId);
  if (target.roles.includes("owner") && !p.roles?.includes("owner")) throw new RelayError("forbidden");
  await authCall(() => createAuth(env).api.removeMember({ headers, body: { memberIdOrEmail: memberId } }));
}

export async function createTeam(env: Env, headers: Headers, name: string): Promise<{ id: string }> {
  const created = await authCall(() => createAuth(env).api.createTeam({ headers, body: { name } }));
  return { id: created.id };
}

async function ownTeam(env: Env, p: Principal, teamId: string): Promise<void> {
  const [row] = await securityDb(env)
    .select({ id: team.id })
    .from(team)
    .where(and(eq(team.id, teamId), eq(team.organizationId, p.workspaceId)));
  if (!row) throw new RelayError("not found");
}

export async function renameTeam(env: Env, p: Principal, headers: Headers, teamId: string, name: string): Promise<void> {
  await ownTeam(env, p, teamId);
  await authCall(() => createAuth(env).api.updateTeam({ headers, body: { teamId, data: { name } } }));
}

export async function deleteTeam(env: Env, p: Principal, headers: Headers, teamId: string): Promise<void> {
  await ownTeam(env, p, teamId);
  await authCall(() => createAuth(env).api.removeTeam({ headers, body: { teamId } }));
}

export async function setTeamMember(
  env: Env,
  p: Principal,
  headers: Headers,
  teamId: string,
  memberId: string,
  on: boolean,
): Promise<void> {
  await ownTeam(env, p, teamId);
  const target = await ownMember(env, p, memberId);
  const body = { teamId, userId: target.userId };
  await authCall(async () => {
    if (on) await createAuth(env).api.addTeamMember({ headers, body });
    else await createAuth(env).api.removeTeamMember({ headers, body });
  });
}

// Any signed-in user may look at an invite; the id is the secret, so the page shows only what the invite already says.
// A signed-in user for another email gets only the state, so the workspace name and invitee email never reach their page.
export async function getInvite(env: Env, { userId }: Session, id: string) {
  const [row] = await securityDb(env)
    .select({
      workspaceName: workspace.name,
      workspaceStatus: workspace.status,
      role: invitation.role,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .innerJoin(workspace, eq(workspace.id, invitation.organizationId))
    .where(eq(invitation.id, id));
  if (!row) return null;
  const [me] = await securityDb(env).select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (me?.email !== row.email) return { state: "other-email" as const };
  if (isSuspended(row.workspaceStatus)) return { state: "suspended" as const };
  return {
    state: "invite" as const,
    workspaceName: row.workspaceName,
    role: row.role ?? "member",
    email: row.email,
    status: effectiveStatus(row),
  };
}

export async function acceptInvite(env: Env, { headers, userId }: Session, id: string): Promise<void> {
  const [row] = await securityDb(env)
    .select({
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      workspaceId: invitation.organizationId,
      recoveryEmail: invitation.recoveryEmail,
      mailboxName: invitation.mailboxName,
      appId: invitation.appId,
    })
    .from(invitation)
    .where(eq(invitation.id, id));
  if (!row) throw new RelayError("not found");
  const [me] = await securityDb(env).select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (me?.email !== row.email) throw new RelayError("this invite is for another email");
  const status = effectiveStatus(row);
  if (status !== "pending") throw new RelayError(INVITE_REFUSAL[status]);
  const accept = () => authCall(() => createAuth(env).api.acceptInvitation({ headers, body: { invitationId: id } }));
  if (!row.recoveryEmail) {
    await accept();
    return;
  }
  const name = row.mailboxName ?? row.email.split("@")[0];
  const addressId = await createPersonalAddress(env, { workspaceId: row.workspaceId, appId: row.appId ?? "", email: row.email, ownerUserId: userId, displayName: name });
  try {
    await accept();
  } catch (err) {
    await coreDb(env).delete(address).where(eq(address.id, addressId));
    throw err;
  }
  await securityDb(env).update(user).set({ recoveryEmail: row.recoveryEmail, name }).where(eq(user.id, userId));
  await refreshWorkspaceLimits(env, row.workspaceId);
}
