import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/console/apps";
import { addAddress, addDomain } from "../src/console/domains";
import { addGrant, getAddressAccess, removeGrant } from "../src/console/grants";
import { messageAccess } from "../src/console/messages";
import { securityDb } from "../src/db/security/client";
import { addressGrant, member, team, user } from "../src/db/security/schema";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const MANAGE = { permission: { mailbox: ["manage"] }, write: true };

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

async function addressFor(cookie: string, domain: string): Promise<string> {
  const actor = await requireActor(env, headersFor(cookie), MANAGE);
  const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
  await addDomain(env, actor, { domain });
  const { id } = await addAddress(env, actor, { appId, email: `in@${domain}`, kind: "both" });
  return id;
}

async function memberIdOf(workspaceId: string, email: string): Promise<string> {
  const [row] = await securityDb(env)
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, workspaceId), eq(user.email, email)));
  return row.id;
}

async function grantIdsFor(addressId: string): Promise<string[]> {
  const rows = await securityDb(env).select({ id: addressGrant.id }).from(addressGrant).where(eq(addressGrant.addressId, addressId));
  return rows.map((r) => r.id);
}

describe("console address access grants", { timeout: 60_000 }, () => {
  it("lists a member grant and a team grant with labels, and refuses a repeat member grant as 409", async () => {
    const owner = await workspaceFor("grant-owner@example.com", "Grant Owner Co");
    const actor = await requireActor(env, headersFor(owner.cookie), MANAGE);
    const addressId = await addressFor(owner.cookie, "grants-a.test");
    await addMember(owner.workspaceId, "grant-m@example.com", "member");
    const memberId = await memberIdOf(owner.workspaceId, "grant-m@example.com");
    const [{ id: teamId }] = await securityDb(env)
      .insert(team)
      .values({ name: "Support", organizationId: owner.workspaceId })
      .returning({ id: team.id });

    await addGrant(env, actor, { addressId, memberId });
    await addGrant(env, actor, { addressId, teamId });

    const access = await getAddressAccess(env, actor, addressId);
    expect(access.address).toEqual({ id: addressId, email: "in@grants-a.test" });
    expect(access.grants.map((g) => [g.kind, g.targetId, g.label]).sort()).toEqual(
      [
        ["member", memberId, "grant-m@example.com"],
        ["team", teamId, "Support"],
      ].sort(),
    );
    expect(access.members.map((m) => m.id)).toContain(memberId);
    expect(access.members.map((m) => m.id)).not.toContain(await memberIdOf(owner.workspaceId, "grant-owner@example.com"));
    expect(access.teams.map((t) => t.id)).toContain(teamId);

    await expect(addGrant(env, actor, { addressId, memberId })).rejects.toMatchObject({
      status: 409,
      message: "already has access",
    });
    await expect(addGrant(env, actor, { addressId, teamId })).rejects.toMatchObject({
      status: 409,
      message: "already has access",
    });
  });

  it("refuses a grant with no grantee or two grantees as 400", async () => {
    const owner = await workspaceFor("grant-shape@example.com", "Grant Shape Co");
    const actor = await requireActor(env, headersFor(owner.cookie), MANAGE);
    const addressId = await addressFor(owner.cookie, "grants-shape.test");
    const memberId = await memberIdOf(owner.workspaceId, "grant-shape@example.com");

    await expect(addGrant(env, actor, { addressId })).rejects.toMatchObject({ status: 400, message: "invalid input" });
    await expect(addGrant(env, actor, { addressId, memberId, teamId: "tea_x" })).rejects.toMatchObject({
      status: 400,
      message: "invalid input",
    });
  });

  it("gives a member role 403 on all three functions", async () => {
    const owner = await workspaceFor("grant-ro-owner@example.com", "Grant RO Co");
    const ownerActor = await requireActor(env, headersFor(owner.cookie), MANAGE);
    const addressId = await addressFor(owner.cookie, "grants-ro.test");
    const memberId = await memberIdOf(owner.workspaceId, "grant-ro-owner@example.com");
    await addGrant(env, ownerActor, { addressId, memberId });
    const [grantId] = await grantIdsFor(addressId);
    const memberCookie = await addMember(owner.workspaceId, "grant-ro-member@example.com", "member");
    const memberActor = await requireActor(env, headersFor(memberCookie), {});

    await expect(getAddressAccess(env, memberActor, addressId)).rejects.toMatchObject({ status: 403 });
    await expect(addGrant(env, memberActor, { addressId, memberId })).rejects.toMatchObject({ status: 403 });
    await expect(removeGrant(env, memberActor, grantId)).rejects.toMatchObject({ status: 403 });
    expect(await grantIdsFor(addressId)).toEqual([grantId]);
  });

  it("answers another workspace's grant or member id with 404 and leaves that grant in place", async () => {
    const a = await workspaceFor("grant-scope-a@example.com", "Grant Scope A");
    const b = await workspaceFor("grant-scope-b@example.com", "Grant Scope B");
    const actorA = await requireActor(env, headersFor(a.cookie), MANAGE);
    const actorB = await requireActor(env, headersFor(b.cookie), MANAGE);
    const addressA = await addressFor(a.cookie, "grant-scope-a.test");
    const addressB = await addressFor(b.cookie, "grant-scope-b.test");
    const memberB = await memberIdOf(b.workspaceId, "grant-scope-b@example.com");
    const memberA = await memberIdOf(a.workspaceId, "grant-scope-a@example.com");
    await addGrant(env, actorB, { addressId: addressB, memberId: memberB });
    const [grantB] = await grantIdsFor(addressB);

    await expect(removeGrant(env, actorA, grantB)).rejects.toMatchObject({ status: 404 });
    expect(await grantIdsFor(addressB)).toEqual([grantB]);
    await expect(addGrant(env, actorA, { addressId: addressA, memberId: memberB })).rejects.toMatchObject({ status: 404 });
    await expect(addGrant(env, actorA, { addressId: addressB, memberId: memberA })).rejects.toMatchObject({ status: 404 });
    await expect(getAddressAccess(env, actorA, addressB)).rejects.toMatchObject({ status: 404 });
  });

  it("stops a revoked member from seeing the inbound address on the next read", async () => {
    const owner = await workspaceFor("grant-revoke@example.com", "Grant Revoke Co");
    const ownerActor = await requireActor(env, headersFor(owner.cookie), MANAGE);
    const addressId = await addressFor(owner.cookie, "grants-revoke.test");
    const memberCookie = await addMember(owner.workspaceId, "grant-revoke-m@example.com", "member");
    const memberActor = await requireActor(env, headersFor(memberCookie), {});
    const memberId = await memberIdOf(owner.workspaceId, "grant-revoke-m@example.com");
    await addGrant(env, ownerActor, { addressId, memberId });
    expect((await messageAccess(env, memberActor)).inbound).toContain(addressId);

    const [grantId] = await grantIdsFor(addressId);
    await removeGrant(env, ownerActor, grantId);
    expect((await messageAccess(env, memberActor)).inbound).not.toContain(addressId);
  });

  it("renders the grant list for an owner and the denied copy for a member", async () => {
    const owner = await workspaceFor("grant-ssr@example.com", "Grant SSR Co");
    const ownerActor = await requireActor(env, headersFor(owner.cookie), MANAGE);
    const addressId = await addressFor(owner.cookie, "grants-ssr.test");
    await addMember(owner.workspaceId, "grant-ssr-m@example.com", "member");
    const memberId = await memberIdOf(owner.workspaceId, "grant-ssr-m@example.com");
    await addGrant(env, ownerActor, { addressId, memberId });
    const memberCookie = await addMember(owner.workspaceId, "grant-ssr-view@example.com", "member");

    const ownerRes = await SELF.fetch(`${ORIGIN}/domains/addresses/${addressId}`, {
      redirect: "manual",
      headers: { cookie: owner.cookie },
    });
    expect(ownerRes.status).toBe(200);
    expect(await ownerRes.text()).toContain("grant-ssr-m@example.com");

    const domainsHtml = await (await SELF.fetch(`${ORIGIN}/domains`, { redirect: "manual", headers: { cookie: owner.cookie } })).text();
    expect(domainsHtml).toContain(`href="/domains/addresses/${addressId}"`);

    const memberRes = await SELF.fetch(`${ORIGIN}/domains/addresses/${addressId}`, {
      redirect: "manual",
      headers: { cookie: memberCookie },
    });
    expect(memberRes.status).toBe(200);
    expect(await memberRes.text()).toContain("Not available to your role");
  });
});
