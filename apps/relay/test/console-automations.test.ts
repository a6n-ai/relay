import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/services/apps";
import { createAutomation, enableAutomation, listAutomations } from "../src/services/automations";
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
  return { workspaceId, owner, cookie };
}

const input = { name: "Welcome", listId: "ctl_none", templateId: "tpl_none", fromEmail: "relay@a6n.ai", delayHours: 0 };

describe("automations console", () => {
  it("lets a member read automations and refuses a create with 403", async () => {
    const { owner, workspaceId } = await workspaceFor("aut-role@example.com", "Aut Role Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const cookie = await addMember(workspaceId, "aut-member@example.com", "member");
    const member = await requireActor(env, headersFor(cookie));
    expect(await listAutomations(env, member, appId)).toEqual([]);
    await expect(requireActor(env, headersFor(cookie), { permission: { campaign: ["send"] }, write: true })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a sender that is not verified in the app with 400 and creates nothing", async () => {
    const { owner } = await workspaceFor("aut-sender@example.com", "Aut Sender Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    await expect(createAutomation(env, owner, appId, input)).rejects.toMatchObject({ status: 400, message: "sender not verified" });
    expect(await listAutomations(env, owner, appId)).toEqual([]);
  });
});
