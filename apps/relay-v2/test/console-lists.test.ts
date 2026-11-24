import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/console/apps";
import {
  addMemberFor,
  createListFor,
  deleteListFor,
  importCsvFor,
  listListsFor,
  listMembersFor,
  removeMemberFor,
  updateListFor,
} from "../src/console/lists";
import { securityDb } from "../src/db/security/client";
import { securityAudit } from "../src/db/security/schema";
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
  return { workspaceId, owner };
}

describe("lists console", () => {
  it("lets a member read lists and refuses a create with 403", async () => {
    const { owner, workspaceId } = await workspaceFor("lst-role@example.com", "Lst Role Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const cookie = await addMember(workspaceId, "lst-member@example.com", "member");
    const member = await requireActor(env, headersFor(cookie));
    await expect(listListsFor(env, member, appId)).resolves.toEqual([]);
    await expect(createListFor(env, member, appId, { name: "VIP", consentSource: "purchase" })).rejects.toMatchObject({ status: 403 });
  });

  it("returns 404 when the app belongs to another workspace", async () => {
    const a = await workspaceFor("lst-a@example.com", "Lst A Co");
    const b = await workspaceFor("lst-b@example.com", "Lst B Co");
    const { id: appB } = await addApp(env, b.owner, { name: "Web", slug: "web" });
    await expect(createListFor(env, a.owner, appB, { name: "VIP", consentSource: "purchase" })).rejects.toMatchObject({ status: 404 });
  });

  it("returns 404 when workspace A names workspace B's list, and B's list is unchanged", async () => {
    const a = await workspaceFor("lst-cross-a@example.com", "Lst Cross A Co");
    const b = await workspaceFor("lst-cross-b@example.com", "Lst Cross B Co");
    const { id: appA } = await addApp(env, a.owner, { name: "Web", slug: "web" });
    const { id: appB } = await addApp(env, b.owner, { name: "Web", slug: "web" });
    const list = await createListFor(env, b.owner, appB, { name: "B list", consentSource: "purchase" });
    await expect(listListsFor(env, a.owner, appA)).resolves.toEqual([]);
    await expect(updateListFor(env, a.owner, list.id, { name: "hijack" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteListFor(env, a.owner, list.id)).rejects.toMatchObject({ status: 404 });
    await expect(listMembersFor(env, a.owner, list.id)).rejects.toMatchObject({ status: 404 });
    await expect(addMemberFor(env, a.owner, list.id, { email: "x@x.test" })).rejects.toMatchObject({ status: 404 });
    await expect(listListsFor(env, b.owner, appB)).resolves.toMatchObject([{ name: "B list" }]);
  });

  it("audits list writes with ids and counts only", async () => {
    const { owner, workspaceId } = await workspaceFor("lst-audit@example.com", "Lst Audit Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const list = await createListFor(env, owner, appId, { name: "VIP", consentSource: "purchase" });
    expect(await addMemberFor(env, owner, list.id, { email: "audit-me@x.test" })).toBe("added");
    const page = await listMembersFor(env, owner, list.id);
    await removeMemberFor(env, owner, list.id, page.rows[0].id);
    const rows = (
      await securityDb(env)
        .select({ action: securityAudit.action, target: securityAudit.target, data: securityAudit.data })
        .from(securityAudit)
        .where(eq(securityAudit.workspaceId, workspaceId))
    ).filter((r) => r.action.startsWith("list."));
    expect(rows.map((r) => r.action)).toEqual(["list.create", "list.member.add", "list.member.remove"]);
    for (const r of rows) expect(JSON.stringify(r)).not.toContain("@");
  });

  it("refuses a CSV import from a member with 403", async () => {
    const { owner, workspaceId } = await workspaceFor("lst-imp-role@example.com", "Lst Imp Role Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const list = await createListFor(env, owner, appId, { name: "Imp", consentSource: "import_other" });
    const cookie = await addMember(workspaceId, "lst-imp-member@example.com", "member");
    const member = await requireActor(env, headersFor(cookie));
    await expect(importCsvFor(env, member, { listId: list.id, csv: "email\na@x.com" })).rejects.toMatchObject({ status: 403 });
  });

  it("imports a CSV for an owner and returns all five counts", async () => {
    const { owner } = await workspaceFor("lst-imp-owner@example.com", "Lst Imp Owner Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const list = await createListFor(env, owner, appId, { name: "Imp", consentSource: "import_other" });
    const csv = "email,first_name\na@x.com,Ann\nA@X.com,dup\nnot-an-email,x\nb@x.com,Bo";
    expect(await importCsvFor(env, owner, { listId: list.id, csv })).toEqual({
      added: 2,
      existing: 0,
      suppressed: 0,
      invalid: 1,
      duplicates: 1,
    });
  });

  it("returns 400 with the parser message for a CSV without an email column", async () => {
    const { owner } = await workspaceFor("lst-imp-bad@example.com", "Lst Imp Bad Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const list = await createListFor(env, owner, appId, { name: "Imp", consentSource: "import_other" });
    await expect(importCsvFor(env, owner, { listId: list.id, csv: "name\nPriya" })).rejects.toMatchObject({
      status: 400,
      message: "missing email column",
    });
  });
});
