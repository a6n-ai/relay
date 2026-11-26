import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/console/apps";
import { addAddress, addDomain } from "../src/console/domains";
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
      expect(html, path).not.toContain("Create app");
    }
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
  });
});
