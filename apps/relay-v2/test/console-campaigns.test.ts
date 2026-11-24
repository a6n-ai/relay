import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/console/apps";
import { createCampaignFor, previewHtmlFor, updateCampaignFor } from "../src/console/campaigns";
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

describe("campaigns console", () => {
  it("refuses a member update with 403", async () => {
    const { owner, workspaceId } = await workspaceFor("cmp-role@example.com", "Cmp Role Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const campaign = await createCampaignFor(env, owner, appId, "Spring");
    const cookie = await addMember(workspaceId, "cmp-member@example.com", "member");
    const member = await requireActor(env, headersFor(cookie));
    await expect(updateCampaignFor(env, member, campaign.id, { subject: "Hi" })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses an unknown merge field with 400", async () => {
    const { owner } = await workspaceFor("cmp-merge@example.com", "Cmp Merge Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const campaign = await createCampaignFor(env, owner, appId, "Spring");
    await expect(updateCampaignFor(env, owner, campaign.id, { html: "{{contact.phone}}" })).rejects.toMatchObject({
      status: 400,
      message: "unknown merge field",
    });
  });

  it("refuses a sender that is not a verified can-send address with 400", async () => {
    const { owner } = await workspaceFor("cmp-sender@example.com", "Cmp Sender Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const campaign = await createCampaignFor(env, owner, appId, "Spring");
    await expect(updateCampaignFor(env, owner, campaign.id, { fromEmail: "news@nowhere.test" })).rejects.toMatchObject({
      status: 400,
      message: "sender not verified",
    });
  });

  it("returns 404 when workspace A names workspace B's campaign", async () => {
    const a = await workspaceFor("cmp-cross-a@example.com", "Cmp Cross A Co");
    const b = await workspaceFor("cmp-cross-b@example.com", "Cmp Cross B Co");
    const { id: appB } = await addApp(env, b.owner, { name: "Web", slug: "web" });
    const campaign = await createCampaignFor(env, b.owner, appB, "B campaign");
    await expect(updateCampaignFor(env, a.owner, campaign.id, { name: "hijack" })).rejects.toMatchObject({ status: 404 });
  });

  it("renders a preview with no script element", async () => {
    const { owner } = await workspaceFor("cmp-preview@example.com", "Cmp Preview Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const campaign = await createCampaignFor(env, owner, appId, "Spring");
    await updateCampaignFor(env, owner, campaign.id, {
      html: '<p>Hi {{contact.first_name}}</p><script>alert(1)</script><a href="{{unsubscribe_url}}">Unsubscribe</a>',
    });
    const preview = await previewHtmlFor(env, owner, campaign.id);
    expect(preview.htmlSafe).not.toContain("<script");
    expect(preview.htmlSafe).toContain("Priya");
  });
});
