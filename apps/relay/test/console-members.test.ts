import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor, requireUser } from "../src/console/actor";
import {
  acceptInvite,
  cancelInvite,
  changeRole,
  createTeam,
  getInvite,
  inviteMember,
  listPeople,
  removeMember,
  renameTeam,
  setTeamMember,
} from "../src/services/members";
import { renameWorkspace } from "../src/services/workspaces";
import { inviteInput } from "../src/console/schemas";
import { securityDb } from "../src/db/security/client";
import { invitation, member, user, workspace } from "../src/db/security/schema";
import { memoryInviteMailer } from "../src/auth/invite-mailer";
import { addMember, cookieFor, createWorkspace, ORIGIN, setActive, signIn } from "./console-helpers";
import { applyMigrations } from "./migrate";

const db = securityDb(env);
const headersFor = (cookie: string) => new Headers({ cookie });
const INVITE = { permission: { invitation: ["create"] }, write: true } as const;
const DAY_MS = 86_400_000;

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

async function workspaceFor(email: string, name: string) {
  const cookie = await cookieFor(email, "admin");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  return { cookie, workspaceId };
}

async function userIdOf(email: string): Promise<string> {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return u.id;
}

async function memberIdOf(workspaceId: string, email: string): Promise<string> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, workspaceId), eq(user.email, email)));
  return row.id;
}

async function seedInvites(workspaceId: string, inviterId: string, count: number, createdAt: Date) {
  const rows = Array.from({ length: count }, (_, i) => ({
    organizationId: workspaceId,
    email: `seed-${createdAt.getTime()}-${i}@x.test`,
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 2 * DAY_MS),
    inviterId,
    createdAt,
  }));
  for (const row of rows) await db.insert(invitation).values(row);
}

describe("console members, teams and invites", { timeout: 60_000 }, () => {
  it("creates the user row for a new email, mails the invite id, and lets the invitee accept after signing in", async () => {
    const owner = await workspaceFor("mem-owner@example.com", "Mem Owner Co");
    const actor = await requireActor(env, headersFor(owner.cookie), INVITE);
    const { id } = await inviteMember(env, actor, headersFor(owner.cookie), { email: "New@X.test", role: "member" });

    const [created] = await db.select().from(user).where(eq(user.email, "new@x.test"));
    expect(created).toMatchObject({ role: "user", emailVerified: false, name: "new" });
    expect(memoryInviteMailer.lastInvite("new@x.test")?.id).toBe(id);

    const cookie = await signIn("new@x.test");
    await acceptInvite(env, await requireUser(env, headersFor(cookie), { write: true }), id);

    const people = await listPeople(env, actor);
    expect(people.members.find((m) => m.email === "new@x.test")).toMatchObject({ roles: ["member"] });
  });

  it("caps invites at 20 a day per workspace and does not count rows older than 24 hours", async () => {
    const owner = await workspaceFor("mem-cap@example.com", "Mem Cap Co");
    const ownerId = await userIdOf("mem-cap@example.com");
    await seedInvites(owner.workspaceId, ownerId, 19, new Date());
    await seedInvites(owner.workspaceId, ownerId, 1, new Date(Date.now() - DAY_MS - 60_000));

    const actor = await requireActor(env, headersFor(owner.cookie), INVITE);
    await inviteMember(env, actor, headersFor(owner.cookie), { email: "cap-20@x.test", role: "member" });
    await expect(
      inviteMember(env, actor, headersFor(owner.cookie), { email: "cap-21@x.test", role: "member" }),
    ).rejects.toMatchObject({ status: 429, message: "invite limit reached" });
  });

  it("refuses an admin inviting as owner", async () => {
    const owner = await workspaceFor("mem-esc-owner@example.com", "Mem Esc Co");
    const adminCookie = await addMember(owner.workspaceId, "mem-esc-admin@example.com", "admin");
    const actor = await requireActor(env, headersFor(adminCookie), INVITE);
    await expect(
      inviteMember(env, actor, headersFor(adminCookie), { email: "esc@x.test", role: "owner" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a member at the invite permission gate", async () => {
    const owner = await workspaceFor("mem-gate-owner@example.com", "Mem Gate Co");
    const cookie = await addMember(owner.workspaceId, "mem-gate-member@example.com", "member");
    await expect(requireActor(env, headersFor(cookie), INVITE)).rejects.toMatchObject({ status: 403 });
  });

  it("returns 404 for another workspace's invite or member and leaves the invite pending", async () => {
    const a = await workspaceFor("mem-focus-a@example.com", "Mem Focus A");
    const b = await workspaceFor("mem-focus-b@example.com", "Mem Focus B");
    const actorB = await requireActor(env, headersFor(b.cookie), INVITE);
    const { id } = await inviteMember(env, actorB, headersFor(b.cookie), { email: "focus@x.test", role: "member" });
    const bMember = await memberIdOf(b.workspaceId, "mem-focus-b@example.com");

    const actorA = await requireActor(env, headersFor(a.cookie), INVITE);
    await expect(cancelInvite(env, actorA, headersFor(a.cookie), id)).rejects.toMatchObject({ status: 404, message: "not found" });
    await expect(changeRole(env, actorA, headersFor(a.cookie), bMember, "member")).rejects.toMatchObject({ status: 404 });
    await expect(removeMember(env, actorA, headersFor(a.cookie), bMember)).rejects.toMatchObject({ status: 404 });

    const [still] = await db.select().from(invitation).where(eq(invitation.id, id));
    expect(still.status).toBe("pending");
  });

  it("refuses to accept an invite signed in as another email", async () => {
    const owner = await workspaceFor("mem-accept-owner@example.com", "Mem Accept Co");
    const actor = await requireActor(env, headersFor(owner.cookie), INVITE);
    const { id } = await inviteMember(env, actor, headersFor(owner.cookie), { email: "invitee@x.test", role: "member" });
    const otherCookie = await cookieFor("someone-else@example.com", "user");
    await expect(acceptInvite(env, await requireUser(env, headersFor(otherCookie), { write: true }), id)).rejects.toMatchObject({
      status: 403,
      message: "this invite is for another email",
    });
    await expect(getInvite(env, await requireUser(env, headersFor(otherCookie)), id)).resolves.toEqual({ state: "other-email" });
  });

  it("redirects a signed-out visit to the invite page to sign-in with the invite path", async () => {
    const res = await SELF.fetch(`${ORIGIN}/invite/inv_missing`, { redirect: "manual" });
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/sign-in?redirect=%2Finvite%2Finv_missing");
  });

  it("creates a team and adds a member to it", async () => {
    const owner = await workspaceFor("mem-team-owner@example.com", "Mem Team Co");
    await addMember(owner.workspaceId, "mem-team-member@example.com", "member");
    const actor = await requireActor(env, headersFor(owner.cookie), { permission: { team: ["create"] }, write: true });
    const { id: teamId } = await createTeam(env, headersFor(owner.cookie), "Support");
    const memberId = await memberIdOf(owner.workspaceId, "mem-team-member@example.com");
    await setTeamMember(env, actor, headersFor(owner.cookie), teamId, memberId, true);

    const people = await listPeople(env, actor);
    expect(people.teams[0]).toMatchObject({ name: "Support", memberIds: [memberId] });
  });

  it("refuses to remove the only owner", async () => {
    const owner = await workspaceFor("mem-last-owner@example.com", "Mem Last Co");
    const actor = await requireActor(env, headersFor(owner.cookie), { permission: { member: ["delete"] }, write: true });
    const ownerMember = await memberIdOf(owner.workspaceId, "mem-last-owner@example.com");
    await expect(removeMember(env, actor, headersFor(owner.cookie), ownerMember)).rejects.toMatchObject({ status: 400 });
  });

  it("still lists people while the workspace is suspended, but refuses writes", async () => {
    const owner = await workspaceFor("mem-susp-owner@example.com", "Mem Susp Co");
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, owner.workspaceId));
    const actor = await requireActor(env, headersFor(owner.cookie));
    await expect(listPeople(env, actor)).resolves.toMatchObject({ members: expect.any(Array) });
    await expect(requireActor(env, headersFor(owner.cookie), INVITE)).rejects.toMatchObject({
      status: 403,
      message: "workspace suspended",
    });
  });

  it("rejects a malformed invite email at the validator and normalises a valid one", async () => {
    expect(inviteInput.safeParse({ email: "not-an-email", role: "member" }).success).toBe(false);
    const [row] = await db.select().from(user).where(eq(user.email, "not-an-email"));
    expect(row).toBeUndefined();
    expect(inviteInput.parse({ email: " Padded@X.test ", role: "member" }).email).toBe("padded@x.test");
  });

  it("creates no user row for an invite refused by the daily cap", async () => {
    const owner = await workspaceFor("mem-cap-norow@example.com", "Mem Cap NoRow Co");
    const ownerId = await userIdOf("mem-cap-norow@example.com");
    await seedInvites(owner.workspaceId, ownerId, 20, new Date());
    const actor = await requireActor(env, headersFor(owner.cookie), INVITE);
    await expect(
      inviteMember(env, actor, headersFor(owner.cookie), { email: "capped-new@x.test", role: "member" }),
    ).rejects.toMatchObject({ status: 429 });
    const [row] = await db.select().from(user).where(eq(user.email, "capped-new@x.test"));
    expect(row).toBeUndefined();
  });

  it("shows a signed-in user for another email only a neutral page, without the workspace name or invitee email", async () => {
    const owner = await workspaceFor("mem-leak-owner@example.com", "Mem Leak Co");
    const actor = await requireActor(env, headersFor(owner.cookie), INVITE);
    const { id } = await inviteMember(env, actor, headersFor(owner.cookie), { email: "leak-invitee@x.test", role: "member" });
    const otherCookie = await cookieFor("leak-other@example.com", "user");

    const res = await SELF.fetch(`${ORIGIN}/invite/${id}`, { redirect: "manual", headers: { cookie: otherCookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("This invite is for a different email address");
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Mem Leak Co");
    expect(html).not.toContain("leak-invitee@x.test");
  });

  it("shows a workspace suspended state to the invitee when the workspace is suspended", async () => {
    const owner = await workspaceFor("mem-invsusp-owner@example.com", "Mem InvSusp Co");
    const actor = await requireActor(env, headersFor(owner.cookie), INVITE);
    const { id } = await inviteMember(env, actor, headersFor(owner.cookie), { email: "invsusp-invitee@x.test", role: "member" });
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, owner.workspaceId));
    const cookie = await signIn("invsusp-invitee@x.test");

    await expect(getInvite(env, await requireUser(env, headersFor(cookie)), id)).resolves.toEqual({ state: "suspended" });
    const res = await SELF.fetch(`${ORIGIN}/invite/${id}`, { redirect: "manual", headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("This workspace is suspended");
  });
});

describe("accepting an invite", { timeout: 60_000 }, () => {
  it("refuses a cross-origin accept", async () => {
    const owner = await workspaceFor("mem-origin-owner@example.com", "Mem Origin Co");
    const actor = await requireActor(env, headersFor(owner.cookie), INVITE);
    await inviteMember(env, actor, headersFor(owner.cookie), { email: "origin-invitee@x.test", role: "member" });
    const cookie = await signIn("origin-invitee@x.test");
    await expect(requireUser(env, new Headers({ cookie, origin: "https://evil.example" }), { write: true })).rejects.toMatchObject({
      status: 403,
      message: "cross-origin write",
    });
  });

  it("refuses to accept into a suspended workspace", async () => {
    const owner = await workspaceFor("mem-accept-susp-owner@example.com", "Mem Accept Susp Co");
    const actor = await requireActor(env, headersFor(owner.cookie), INVITE);
    const { id } = await inviteMember(env, actor, headersFor(owner.cookie), { email: "susp-invitee@x.test", role: "member" });
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, owner.workspaceId));
    const cookie = await signIn("susp-invitee@x.test");
    await expect(acceptInvite(env, await requireUser(env, headersFor(cookie), { write: true }), id)).rejects.toMatchObject({
      status: 403,
      message: "workspace suspended",
    });
  });

  it("renames a team and refuses a member with 403 and another workspace with 404", async () => {
    const a = await workspaceFor("mem-rt-a@example.com", "Mem RT A Co");
    const b = await workspaceFor("mem-rt-b@example.com", "Mem RT B Co");
    const need = { permission: { team: ["update"] }, write: true } as const;
    const actorA = await requireActor(env, headersFor(a.cookie), need);
    const actorB = await requireActor(env, headersFor(b.cookie), need);
    const { id: teamId } = await createTeam(env, headersFor(a.cookie), "Support");
    await renameTeam(env, actorA, headersFor(a.cookie), teamId, "Success");
    const people = await listPeople(env, actorA);
    expect(people.teams[0]).toMatchObject({ id: teamId, name: "Success" });
    await expect(renameTeam(env, actorB, headersFor(b.cookie), teamId, "x")).rejects.toMatchObject({ status: 404 });
    const memberCookie = await addMember(a.workspaceId, "mem-rt-member@example.com", "member");
    await expect(requireActor(env, headersFor(memberCookie), need)).rejects.toMatchObject({ status: 403 });
  });

  it("renames a workspace, keeps its slug, and refuses a member with 403", async () => {
    const a = await workspaceFor("mem-rw@example.com", "Mem RW Co");
    const need = { permission: { organization: ["update"] }, write: true } as const;
    const actor = await requireActor(env, headersFor(a.cookie), need);
    await renameWorkspace(env, actor, headersFor(a.cookie), "Renamed Co");
    const [row] = await db.select({ name: workspace.name, slug: workspace.slug }).from(workspace).where(eq(workspace.id, a.workspaceId));
    expect(row).toMatchObject({ name: "Renamed Co", slug: "Mem RW Co" });
    const memberCookie = await addMember(a.workspaceId, "mem-rw-member@example.com", "member");
    await expect(requireActor(env, headersFor(memberCookie), need)).rejects.toMatchObject({ status: 403 });
  });
});
