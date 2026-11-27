import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addSuppression, listSuppressions, removeSuppression } from "../src/services/suppressions";
import { clientFor } from "../src/do/client";
import { securityDb } from "../src/db/security/client";
import { securityAudit, workspace } from "../src/db/security/schema";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

async function workspaceFor(email: string, name: string) {
  const cookie = await cookieFor(email, "user");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  const owner = await requireActor(env, headersFor(cookie));
  return { cookie, workspaceId, owner };
}

async function roleActor(workspaceId: string, email: string, role: "member" | "billing") {
  const cookie = await addMember(workspaceId, email, role);
  return { cookie, actor: await requireActor(env, headersFor(cookie)) };
}

const stub = (workspaceId: string) => clientFor(env, workspaceId);

describe("suppressions console", () => {
  it("normalises an added email and lists it as a manual, all-streams row", async () => {
    const { owner } = await workspaceFor("sup-add@example.com", "Sup Add Co");
    await addSuppression(env, owner, { email: "A@X.test " });
    const page = await listSuppressions(env, owner, {});
    expect(page.rows).toEqual([{ email: "a@x.test", reason: "manual", stream: null, createdAt: expect.any(Number) }]);
    expect(page.nextCursor).toBeNull();
  });

  it("keeps a bounce and a manual block side by side", async () => {
    const { owner, workspaceId } = await workspaceFor("sup-rank@example.com", "Sup Rank Co");
    await stub(workspaceId).addSuppression(workspaceId, "b@x.test", "bounce");
    await addSuppression(env, owner, { email: "b@x.test" });
    const page = await listSuppressions(env, owner, {});
    expect(page.rows.map((r) => [r.email, r.reason])).toEqual([
      ["b@x.test", "bounce"],
      ["b@x.test", "manual"],
    ]);
  });

  it("removes only the named reason", async () => {
    const { owner, workspaceId } = await workspaceFor("sup-one@example.com", "Sup One Co");
    await stub(workspaceId).addSuppression(workspaceId, "b@x.test", "bounce");
    await addSuppression(env, owner, { email: "b@x.test" });
    await removeSuppression(env, owner, "b@x.test", "manual");
    expect((await listSuppressions(env, owner, {})).rows.map((r) => r.reason)).toEqual(["bounce"]);
    expect(await stub(workspaceId).isSuppressed(workspaceId, "b@x.test", "transactional")).toBe(true);
  });

  it("removes a manual row so later sends are not suppressed", async () => {
    const { owner, workspaceId } = await workspaceFor("sup-remove@example.com", "Sup Remove Co");
    await addSuppression(env, owner, { email: "m@x.test" });
    expect(await stub(workspaceId).isSuppressed(workspaceId, "m@x.test", "marketing")).toBe(true);
    await expect(removeSuppression(env, owner, "m@x.test", "manual")).resolves.toBeUndefined();
    expect(await stub(workspaceId).isSuppressed(workspaceId, "m@x.test", "marketing")).toBe(false);
  });

  it("removes a bounce row", async () => {
    const { owner, workspaceId } = await workspaceFor("sup-bounce@example.com", "Sup Bounce Co");
    await stub(workspaceId).addSuppression(workspaceId, "r@x.test", "bounce");
    await removeSuppression(env, owner, "r@x.test", "bounce");
    expect((await listSuppressions(env, owner, {})).rows).toEqual([]);
  });

  it("audits add and remove with a masked address, and only a removal that happened", async () => {
    const { owner, workspaceId } = await workspaceFor("sup-audit@example.com", "Sup Audit Co");
    await addSuppression(env, owner, { email: "Secret.Person@Example.test", stream: "marketing" });
    await stub(workspaceId).addSuppression(workspaceId, "c@x.test", "complaint");
    await expect(removeSuppression(env, owner, "c@x.test", "complaint")).rejects.toMatchObject({ status: 409 });
    await removeSuppression(env, owner, "secret.person@example.test", "manual");
    const rows = await securityDb(env)
      .select({ action: securityAudit.action, target: securityAudit.target, data: securityAudit.data })
      .from(securityAudit)
      .where(eq(securityAudit.workspaceId, workspaceId));
    const audits = rows.filter((r) => r.action.startsWith("suppression."));
    expect(audits.map((r) => r.action).sort()).toEqual(["suppression.add", "suppression.remove"]);
    expect(audits.find((r) => r.action === "suppression.add")).toMatchObject({ target: "s***@example.test", data: '{"stream":"marketing"}' });
    expect(JSON.stringify(rows)).not.toMatch(/secret\.person|c@x\.test/i);
  });

  it("refuses to remove a complaint or an unsubscribe", async () => {
    const { owner, workspaceId } = await workspaceFor("sup-optout@example.com", "Sup Optout Co");
    await stub(workspaceId).addSuppression(workspaceId, "c@x.test", "complaint");
    await stub(workspaceId).addSuppression(workspaceId, "u@x.test", "unsubscribe");
    await expect(removeSuppression(env, owner, "c@x.test", "complaint")).rejects.toMatchObject({ status: 409, message: "recipient opted out" });
    await expect(removeSuppression(env, owner, "u@x.test", "unsubscribe")).rejects.toMatchObject({ status: 409, message: "recipient opted out" });
    const emails = (await listSuppressions(env, owner, {})).rows.map((r) => r.email);
    expect(emails).toEqual(["c@x.test", "u@x.test"]);
  });

  it("returns 404 when removing an email that is not suppressed", async () => {
    const { owner } = await workspaceFor("sup-missing@example.com", "Sup Missing Co");
    await expect(removeSuppression(env, owner, "nobody@x.test", "manual")).rejects.toMatchObject({ status: 404, message: "not found" });
  });

  it("pages 120 rows in 50, 50 and 20 with no repeats", async () => {
    const { owner, workspaceId } = await workspaceFor("sup-page@example.com", "Sup Page Co");
    for (let i = 0; i < 120; i++) {
      await stub(workspaceId).addSuppression(workspaceId, `u${String(i).padStart(3, "0")}@x.test`, "manual");
    }
    const first = await listSuppressions(env, owner, {});
    expect(first.rows).toHaveLength(50);
    expect(first.nextCursor).toBe(`manual:${first.rows[49].email}`);
    const second = await listSuppressions(env, owner, { cursor: first.nextCursor ?? undefined });
    expect(second.rows).toHaveLength(50);
    expect(second.nextCursor).toBe(`manual:${second.rows[49].email}`);
    const third = await listSuppressions(env, owner, { cursor: second.nextCursor ?? undefined });
    expect(third.rows).toHaveLength(20);
    expect(third.nextCursor).toBeNull();
    const all = [...first.rows, ...second.rows, ...third.rows].map((r) => r.email);
    expect(new Set(all).size).toBe(120);
  });

  it("pages between two reasons of one address without losing either", async () => {
    const { owner, workspaceId } = await workspaceFor("sup-split@example.com", "Sup Split Co");
    for (let i = 0; i < 49; i++) await stub(workspaceId).addSuppression(workspaceId, `a${String(i).padStart(2, "0")}@x.test`, "manual");
    await stub(workspaceId).addSuppression(workspaceId, "z@x.test", "bounce");
    await stub(workspaceId).addSuppression(workspaceId, "z@x.test", "manual");
    const first = await listSuppressions(env, owner, {});
    const second = await listSuppressions(env, owner, { cursor: first.nextCursor ?? undefined });
    expect(first.rows[49]).toMatchObject({ email: "z@x.test", reason: "bounce" });
    expect(second.rows.map((r) => [r.email, r.reason])).toEqual([["z@x.test", "manual"]]);
    await expect(listSuppressions(env, owner, { cursor: "z@x.test" })).rejects.toMatchObject({ message: "invalid cursor" });
  });

  it("prefix matches only emails that start with the prefix", async () => {
    const { owner, workspaceId } = await workspaceFor("sup-prefix@example.com", "Sup Prefix Co");
    for (const email of ["a@x.test", "a@y.test", "ab@x.test", "ba@x.test"]) {
      await stub(workspaceId).addSuppression(workspaceId, email, "manual");
    }
    const page = await listSuppressions(env, owner, { prefix: "A@" });
    expect(page.rows.map((r) => r.email)).toEqual(["a@x.test", "a@y.test"]);
  });

  it("lets a member list but refuses a member's add, and refuses billing's list", async () => {
    const { workspaceId, owner } = await workspaceFor("sup-roles@example.com", "Sup Roles Co");
    await addSuppression(env, owner, { email: "seen@x.test" });
    const member = await roleActor(workspaceId, "sup-roles-m@example.com", "member");
    const billing = await roleActor(workspaceId, "sup-roles-b@example.com", "billing");
    const page = await listSuppressions(env, member.actor, {});
    expect(page.rows.map((r) => r.email)).toEqual(["seen@x.test"]);
    await expect(requireActor(env, headersFor(member.cookie), { permission: { sending: ["write"] }, write: true })).rejects.toMatchObject({ status: 403 });
    await expect(requireActor(env, headersFor(billing.cookie), { permission: { sending: ["read"] } })).rejects.toMatchObject({ status: 403 });
  });

  it("lists in a suspended workspace and refuses an add with workspace suspended", async () => {
    const { cookie, workspaceId } = await workspaceFor("sup-suspended@example.com", "Sup Suspended Co");
    await securityDb(env).update(workspace).set({ status: "suspended" }).where(eq(workspace.id, workspaceId));
    const actor = await requireActor(env, headersFor(cookie));
    expect(actor.workspaceStatus).toBe("suspended");
    await expect(listSuppressions(env, actor, {})).resolves.toMatchObject({ rows: [] });
    await expect(requireActor(env, headersFor(cookie), { permission: { sending: ["write"] }, write: true })).rejects.toMatchObject({
      status: 403,
      message: "workspace suspended",
    });
  });

  it("renders Suppress address for an owner, and not for a member", async () => {
    const { cookie, workspaceId, owner } = await workspaceFor("sup-ssr@example.com", "Sup SSR Co");
    await addSuppression(env, owner, { email: "ssr-manual@x.test" });
    await stub(workspaceId).addSuppression(workspaceId, "ssr-opt@x.test", "unsubscribe");
    const ownerRes = await SELF.fetch(`${ORIGIN}/messages/suppressions`, { redirect: "manual", headers: { cookie } });
    expect(ownerRes.status).toBe(200);
    const ownerHtml = await ownerRes.text();
    expect(ownerHtml).toContain("ssr-manual@x.test");
    expect(ownerHtml).toContain("Opted out");
    expect(ownerHtml).toContain(">Suppress address<");
    const memberCookie = await addMember(workspaceId, "ssr-member@example.com", "member");
    const memberRes = await SELF.fetch(`${ORIGIN}/messages/suppressions`, { redirect: "manual", headers: { cookie: memberCookie } });
    expect(memberRes.status).toBe(200);
    const memberHtml = await memberRes.text();
    expect(memberHtml).toContain("ssr-manual@x.test");
    expect(memberHtml).not.toContain(">Suppress address<");
  });
});
