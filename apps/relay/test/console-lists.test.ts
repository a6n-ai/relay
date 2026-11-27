import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/services/apps";
import { membersCsvHeader } from "../src/core/csv";
import { addMember as addListMember, exportMembers, createList, deleteList, importCsv, listLists, listMembers, removeMember, updateContact, updateList } from "../src/services/lists";
import { securityDb } from "../src/db/security/client";
import { securityAudit } from "../src/db/security/schema";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const EDIT = { permission: { list: ["write"] }, write: true } as const;
const IMPORT = { permission: { list: ["import"] }, write: true } as const;

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

async function workspaceFor(email: string, name: string) {
  const cookie = await cookieFor(email, "user");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  const owner = await requireActor(env, headersFor(cookie));
  return { workspaceId, owner, cookie };
}

describe("lists console", () => {
  it("renders the not-found state, not an error, for a list in another workspace", async () => {
    const a = await workspaceFor("lst-ssr-a@example.com", "Lst SSR A Co");
    const b = await workspaceFor("lst-ssr-b@example.com", "Lst SSR B Co");
    const { id: appA } = await addApp(env, a.owner, { name: "Web", slug: "web" });
    const { id: appB } = await addApp(env, b.owner, { name: "Web", slug: "web" });
    const foreign = await createList(env, b.owner, appB, { name: "VIP", consentSource: "purchase" });
    const res = await SELF.fetch(`${ORIGIN}/lists/${foreign.id}?appId=${appA}`, { headers: { cookie: a.cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("List not found");
  });

  it("lets a member read lists and refuses a create with 403", async () => {
    const { owner, workspaceId } = await workspaceFor("lst-role@example.com", "Lst Role Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const cookie = await addMember(workspaceId, "lst-member@example.com", "member");
    const member = await requireActor(env, headersFor(cookie));
    await expect(listLists(env, member, appId)).resolves.toEqual([]);
    await expect(requireActor(env, headersFor(cookie), EDIT)).rejects.toMatchObject({ status: 403 });
  });

  it("returns 404 when the app belongs to another workspace", async () => {
    const a = await workspaceFor("lst-a@example.com", "Lst A Co");
    const b = await workspaceFor("lst-b@example.com", "Lst B Co");
    const { id: appB } = await addApp(env, b.owner, { name: "Web", slug: "web" });
    await expect(createList(env, a.owner, appB, { name: "VIP", consentSource: "purchase" })).rejects.toMatchObject({ status: 404 });
  });

  it("returns 404 when workspace A names workspace B's list, and B's list is unchanged", async () => {
    const a = await workspaceFor("lst-cross-a@example.com", "Lst Cross A Co");
    const b = await workspaceFor("lst-cross-b@example.com", "Lst Cross B Co");
    const { id: appA } = await addApp(env, a.owner, { name: "Web", slug: "web" });
    const { id: appB } = await addApp(env, b.owner, { name: "Web", slug: "web" });
    const list = await createList(env, b.owner, appB, { name: "B list", consentSource: "purchase" });
    await expect(listLists(env, a.owner, appA)).resolves.toEqual([]);
    await expect(updateList(env, a.owner, list.id, { name: "hijack" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteList(env, a.owner, list.id)).rejects.toMatchObject({ status: 404 });
    await expect(listMembers(env, a.owner, list.id)).rejects.toMatchObject({ status: 404 });
    await expect(addListMember(env, a.owner, list.id, { email: "x@x.test" })).rejects.toMatchObject({ status: 404 });
    await expect(listLists(env, b.owner, appB)).resolves.toMatchObject([{ name: "B list" }]);
  });

  it("audits list writes with ids and counts only", async () => {
    const { owner, workspaceId } = await workspaceFor("lst-audit@example.com", "Lst Audit Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const list = await createList(env, owner, appId, { name: "VIP", consentSource: "purchase" });
    expect(await addListMember(env, owner, list.id, { email: "audit-me@x.test" })).toBe("added");
    const page = await listMembers(env, owner, list.id);
    await removeMember(env, owner, list.id, page.rows[0].id);
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
    await createList(env, owner, appId, { name: "Imp", consentSource: "import_other" });
    const cookie = await addMember(workspaceId, "lst-imp-member@example.com", "member");
    await expect(requireActor(env, headersFor(cookie), IMPORT)).rejects.toMatchObject({ status: 403 });
  });

  it("imports a CSV for an owner and returns all five counts", async () => {
    const { owner } = await workspaceFor("lst-imp-owner@example.com", "Lst Imp Owner Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const list = await createList(env, owner, appId, { name: "Imp", consentSource: "import_other" });
    const csv = "email,first_name\na@x.com,Ann\nA@X.com,dup\nnot-an-email,x\nb@x.com,Bo";
    expect(await importCsv(env, owner, { listId: list.id, csv })).toEqual({
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
    const list = await createList(env, owner, appId, { name: "Imp", consentSource: "import_other" });
    await expect(importCsv(env, owner, { listId: list.id, csv: "name\nPriya" })).rejects.toMatchObject({
      status: 400,
      message: "missing email column",
    });
  });
});

describe("list export", () => {
  it("streams a CSV with a header, one line per member, and formula cells neutralised", async () => {
    const { owner } = await workspaceFor("lst-export@example.com", "Lst Export Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const list = await createList(env, owner, appId, { name: "VIP", consentSource: "express_optin" });
    const csv = ["email,first_name", "cmd@x.com,=cmd", ...Array.from({ length: 2049 }, (_, i) => `m${String(i).padStart(4, "0")}@x.com,Ann`)];
    await importCsv(env, owner, { listId: list.id, csv: csv.join("\n") });
    const res = await exportMembers(env, owner, list.id);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const lines = (await res.text()).split("\n").filter(Boolean);
    expect(lines).toHaveLength(2051);
    expect(lines[0]).toBe(membersCsvHeader);
    expect(lines.filter((l) => l.startsWith("cmd@x.com,'=cmd,"))).toHaveLength(1);
    expect(await securityDb(env).select().from(securityAudit).where(eq(securityAudit.action, "list.export"))).not.toHaveLength(0);
  });

  it("refuses a member with 403 and another workspace's list with 404", async () => {
    const a = await workspaceFor("lst-export-a@example.com", "Lst Export A Co");
    const b = await workspaceFor("lst-export-b@example.com", "Lst Export B Co");
    const { id: appA } = await addApp(env, a.owner, { name: "Web", slug: "web" });
    const { id: appB } = await addApp(env, b.owner, { name: "Web", slug: "web" });
    await createList(env, a.owner, appA, { name: "Own", consentSource: "purchase" });
    const foreign = await createList(env, b.owner, appB, { name: "Foreign", consentSource: "purchase" });
    await expect(exportMembers(env, a.owner, foreign.id)).rejects.toMatchObject({ status: 404 });
    const cookie = await addMember(a.workspaceId, "lst-export-member@example.com", "member");
    await expect(requireActor(env, headersFor(cookie), IMPORT)).rejects.toMatchObject({ status: 403 });
  });

  it("renames a contact, keeps the email, audits it, and refuses a member and another workspace", async () => {
    const a = await workspaceFor("lst-contact-a@example.com", "Lst Contact A Co");
    const b = await workspaceFor("lst-contact-b@example.com", "Lst Contact B Co");
    const { id: appA } = await addApp(env, a.owner, { name: "Web", slug: "web" });
    const list = await createList(env, a.owner, appA, { name: "VIP", consentSource: "purchase" });
    await addListMember(env, a.owner, list.id, { email: "ann@x.test", firstName: "Ann" });
    const contactId = (await listMembers(env, a.owner, list.id)).rows[0].id;
    await updateContact(env, a.owner, { listId: list.id, contactId, firstName: "Anna", lastName: "Lee" });
    expect((await listMembers(env, a.owner, list.id)).rows[0]).toMatchObject({ email: "ann@x.test", firstName: "Anna", lastName: "Lee" });
    const audit = await securityDb(env).select({ action: securityAudit.action }).from(securityAudit).where(eq(securityAudit.workspaceId, a.workspaceId));
    expect(audit.map((r) => r.action)).toContain("list.member.update");
    const cookie = await addMember(a.workspaceId, "lst-contact-member@example.com", "member");
    await expect(requireActor(env, headersFor(cookie), EDIT)).rejects.toMatchObject({ status: 403 });
    await expect(updateContact(env, b.owner, { listId: list.id, contactId, firstName: "x", lastName: "" })).rejects.toMatchObject({ status: 404 });
    expect((await listMembers(env, a.owner, list.id)).rows[0]).toMatchObject({ firstName: "Anna" });
  });
});
