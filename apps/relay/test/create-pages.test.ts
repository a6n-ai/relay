import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/services/apps";
import { addAddress, addDomain } from "../src/services/domains";
import { createListFor } from "../src/console/lists";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

const get = (path: string, cookie: string) => SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", headers: { cookie } });

describe("create pages", { timeout: 60_000 }, () => {
  it("render for a writer and are denied to a read-only member", async () => {
    const cookie = await cookieFor("create-pages-owner@example.com", "admin");
    const workspaceId = await createWorkspace(cookie, "Create Pages Co");
    await setActive(cookie, workspaceId);
    const member = await addMember(workspaceId, "create-pages-member@example.com", "member");

    for (const [path, heading] of [
      ["/apps/new", "New app"],
      ["/domains/new", "Add domain"],
      ["/domains/addresses/new", "Add address"],
    ] as const) {
      const ok = await get(path, cookie);
      expect(ok.status, path).toBe(200);
      expect(await ok.text(), path).toContain(heading);

      const denied = await get(path, member);
      expect(denied.status, path).toBe(200);
      const html = await denied.text();
      expect(html, path).toContain("Not available to your role");
      expect(html, path).not.toContain('id="app-name"');
      expect(html, path).not.toContain('id="address-local"');
      expect(html, path).not.toContain('id="domain-name"');
    }
  });

  it("serves /workspaces/new to a signed-in user with no workspace and redirects signed-out", async () => {
    const lonely = await cookieFor("create-pages-lonely@example.com", "user");
    const page = await get("/workspaces/new", lonely);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("New workspace");
    expect(html).toContain('id="workspace-name"');
    const out = await get("/workspaces/new", "");
    expect(out.status).toBe(307);
    expect(out.headers.get("location")).toContain("/sign-in");
    const apps = await get("/apps", lonely);
    expect(apps.status).toBe(307);
    expect(apps.headers.get("location")).toContain("/no-workspace");
  });

  it("sends an owner with no app to create one before adding an address", async () => {
    const cookie = await cookieFor("create-pages-empty@example.com", "admin");
    await setActive(cookie, await createWorkspace(cookie, "Create Pages Empty"));
    const html = await (await get("/domains/addresses/new", cookie)).text();
    expect(html).toContain("Create an app first");
  });

  it("renders the address page with a remove card for a writer and denies a member", async () => {
    const cookie = await cookieFor("create-pages-addr@example.com", "admin");
    const workspaceId = await createWorkspace(cookie, "Create Pages Addr");
    await setActive(cookie, workspaceId);
    const actor = await requireActor(env, headersFor(cookie), { permission: { tenant: ["write"] }, write: true });
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    const sendingActor = await requireActor(env, headersFor(cookie), { permission: { sending: ["write"] }, write: true });
    await addDomain(env, sendingActor, { domain: "create-pages.test" });
    const created = await addAddress(env, sendingActor, { appId, email: "hi@create-pages.test", kind: "sender" });
    const member = await addMember(workspaceId, "create-pages-addr-member@example.com", "member");

    const ok = await get(`/domains/addresses/${created.id}`, cookie);
    expect(ok.status).toBe(200);
    const html = await ok.text();
    expect(html).toContain("hi@create-pages.test");
    expect(html).toContain("Remove address");

    expect(await (await get(`/domains/addresses/${created.id}`, member)).text()).toContain("Not available to your role");

    const billing = await addMember(workspaceId, "create-pages-addr-billing@example.com", "billing");
    const denied = await get(`/domains/addresses/${created.id}`, billing);
    expect(denied.status).toBe(200);
    const deniedHtml = await denied.text();
    expect(deniedHtml).toContain("Not available to your role");
    expect(deniedHtml).not.toContain("Remove address");
  });
});

describe("campaign, template, automation, list and import pages", { timeout: 60_000 }, () => {
  it("render for a writer and are denied to a member and billing", async () => {
    const cookie = await cookieFor("create-pages-t4-owner@example.com", "admin");
    const workspaceId = await createWorkspace(cookie, "Create Pages T4");
    await setActive(cookie, workspaceId);
    const actor = await requireActor(env, headersFor(cookie), { permission: { tenant: ["write"] }, write: true });
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    const member = await addMember(workspaceId, "create-pages-t4-member@example.com", "member");
    const billing = await addMember(workspaceId, "create-pages-t4-billing@example.com", "billing");

    for (const [path, heading, form] of [
      ["/campaigns/new", "New campaign", 'id="campaign-name"'],
      ["/campaigns/templates/new", "New template", 'id="template-name"'],
      ["/campaigns/automations/new", "New automation", 'id="automation-name"'],
      ["/lists/new", "New list", 'id="list-name"'],
    ] as const) {
      const ok = await get(path, cookie);
      expect(ok.status, path).toBe(200);
      const html = await ok.text();
      expect(html, path).toContain(heading);
      expect(html, path).toContain(form);

      for (const denied of [member, billing]) {
        const res = await get(path, denied);
        expect(res.status, path).toBe(200);
        const text = await res.text();
        expect(text, path).toContain("Not available to your role");
        expect(text, path).not.toContain(form);
      }
    }

    for (const role of [member, billing]) {
      const text = await (await get(`/lists/lst_000000000000/import?appId=${appId}`, role)).text();
      expect(text).toContain("Not available to your role");
    }
  });

  it("renders the import page for a writer and says when the list or automation is unknown", async () => {
    const cookie = await cookieFor("create-pages-t4b-owner@example.com", "admin");
    const workspaceId = await createWorkspace(cookie, "Create Pages T4b");
    await setActive(cookie, workspaceId);
    const actor = await requireActor(env, headersFor(cookie), { permission: { tenant: ["write"] }, write: true });
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    const list = await createListFor(env, actor, appId, { name: "Newsletter", consentSource: "express_optin" });
    const member = await addMember(workspaceId, "create-pages-t4b-member@example.com", "member");
    const billing = await addMember(workspaceId, "create-pages-t4b-billing@example.com", "billing");

    const ok = await (await get(`/lists/${list.id}/import?appId=${appId}`, cookie)).text();
    expect(ok).toContain("CSV file");
    expect(ok).toContain("Choose a CSV file first.");
    expect(await (await get(`/lists/lst_000000000000/import?appId=${appId}`, cookie)).text()).toContain("List not found");

    const automationPath = "/campaigns/automations/aut_000000000000";
    expect(await (await get(automationPath, cookie)).text()).toContain("Automation not found");
    for (const role of [member, billing]) {
      const text = await (await get(automationPath, role)).text();
      expect(text).toContain("Not available to your role");
    }
  });

  it("sends an owner with no app to create one first", async () => {
    const cookie = await cookieFor("create-pages-t4-empty@example.com", "admin");
    await setActive(cookie, await createWorkspace(cookie, "Create Pages T4 Empty"));
    for (const path of ["/campaigns/new", "/campaigns/templates/new", "/campaigns/automations/new", "/lists/new"]) {
      expect(await (await get(path, cookie)).text(), path).toContain("Create an app first");
    }
  });
});
