import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { campaignProblems } from "../src/shared/campaign-problems";
import { clientFor } from "../src/do/client";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/services/apps";
import {
  campaignStats,
  cancelCampaign,
  createCampaign,
  getCampaign,
  pauseCampaign,
  previewHtml,
  resumeCampaign,
  scheduleCampaign,
  setPostalAddress,
  testSendCampaign,
  updateCampaign,
} from "../src/services/campaigns";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations, seedVerifiedSender } from "./migrate";

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
    const campaign = await createCampaign(env, owner, appId, { name: "Spring" });
    const cookie = await addMember(workspaceId, "cmp-member@example.com", "member");
    await expect(requireActor(env, headersFor(cookie), { permission: { campaign: ["write"] }, write: true })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses an unknown merge field with 400", async () => {
    const { owner } = await workspaceFor("cmp-merge@example.com", "Cmp Merge Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const campaign = await createCampaign(env, owner, appId, { name: "Spring" });
    await expect(updateCampaign(env, owner, campaign.id, { html: "{{contact.phone}}" })).rejects.toMatchObject({
      status: 400,
      message: "unknown merge field",
    });
  });

  it("refuses a sender that is not a verified can-send address with 400", async () => {
    const { owner } = await workspaceFor("cmp-sender@example.com", "Cmp Sender Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const campaign = await createCampaign(env, owner, appId, { name: "Spring" });
    await expect(updateCampaign(env, owner, campaign.id, { fromEmail: "news@nowhere.test" })).rejects.toMatchObject({
      status: 400,
      message: "sender not verified",
    });
  });

  it("returns 404 when workspace A names workspace B's campaign", async () => {
    const a = await workspaceFor("cmp-cross-a@example.com", "Cmp Cross A Co");
    const b = await workspaceFor("cmp-cross-b@example.com", "Cmp Cross B Co");
    const { id: appB } = await addApp(env, b.owner, { name: "Web", slug: "web" });
    const campaign = await createCampaign(env, b.owner, appB, { name: "B campaign" });
    await expect(updateCampaign(env, a.owner, campaign.id, { name: "hijack" })).rejects.toMatchObject({ status: 404 });
  });

  it("starts a campaign from a template, and 404s on a template the app does not own", async () => {
    const { owner } = await workspaceFor("cmp-tpl@example.com", "Cmp Tpl Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const tpl = (await clientFor(env, owner.workspaceId).createTemplate(owner.workspaceId, appId, {
      name: "T",
      subject: "Spring",
      html: "<p>a</p>",
      text: "a",
    })) as { id: string };
    const campaign = await createCampaign(env, owner, appId, { name: "From template", templateId: tpl.id });
    expect(campaign).toMatchObject({ subject: "Spring", html: "<p>a</p>", text: "a" });
    await expect(createCampaign(env, owner, appId, { name: "Missing", templateId: "tpl_nope" })).rejects.toMatchObject({ status: 404 });
  });

  it("renders a preview with no script element", async () => {
    const { owner } = await workspaceFor("cmp-preview@example.com", "Cmp Preview Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const campaign = await createCampaign(env, owner, appId, { name: "Spring" });
    await updateCampaign(env, owner, campaign.id, {
      html: '<p>Hi {{contact.first_name}}</p><script>alert(1)</script><a href="{{unsubscribe_url}}">Unsubscribe</a>',
    });
    const preview = await previewHtml(env, owner, campaign.id);
    expect(preview.htmlSafe).not.toContain("<script");
    expect(preview.htmlSafe).toContain("Priya");
  });
});

describe("campaign lifecycle console", () => {
  const BODY = {
    subject: "Hi {{contact.first_name}}",
    html: '<p>Hi</p><p>{{postal_address}}</p><a href="{{unsubscribe_url}}">Unsubscribe</a>',
    text: "Hi {{postal_address}} {{unsubscribe_url}}",
  };
  const HOUR = 3_600_000;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The DO is the writer; the fixture writes the sender directly so the Workflow tests need no verified domain.
  async function readyFixture(email: string, name: string) {
    const { owner, workspaceId } = await workspaceFor(email, name);
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const client = clientFor(env, workspaceId);
    const list = await client.createList(workspaceId, appId, { name: "L", consentSource: "express_optin" });
    await client.addMember(workspaceId, list.id, { email: "ann@x.com", firstName: "Ann" });
    const campaign = await createCampaign(env, owner, appId, { name: "Spring" });
    await seedVerifiedSender(workspaceId, appId);
    await client.updateCampaign(workspaceId, campaign.id, { ...BODY, fromEmail: "relay@a6n.ai", listIds: [list.id] });
    await setPostalAddress(env, owner, "1 Main St");
    return { owner, workspaceId, campaignId: campaign.id };
  }

  function spyWorkflow() {
    const create = vi.spyOn(env.CAMPAIGNS, "create").mockResolvedValue({ id: "run", status: async () => ({}) } as never);
    const terminate = vi.fn(async () => {});
    vi.spyOn(env.CAMPAIGNS, "get").mockReturnValue({ terminate } as never);
    return { create, terminate };
  }

  it("schedules a ready campaign as instance <id>-1", async () => {
    const { owner, campaignId } = await readyFixture("cmp-sched@example.com", "Cmp Sched Co");
    const { create } = spyWorkflow();
    const at = Date.now() + HOUR;
    expect(await scheduleCampaign(env, owner, campaignId, at)).toEqual({ runSeq: 1 });
    expect(create).toHaveBeenCalledWith({
      id: `${campaignId}-1`,
      params: expect.objectContaining({ campaignId, runSeq: 1, at }),
    });
    expect(await getCampaign(env, owner, campaignId)).toMatchObject({ status: "scheduled", runSeq: 1 });
  });

  it("returns the campaign to draft with 503 when the workflow cannot start", async () => {
    const { owner, campaignId } = await readyFixture("cmp-503@example.com", "Cmp 503 Co");
    const { create } = spyWorkflow();
    create.mockRejectedValueOnce(new Error("workflow down"));
    await expect(scheduleCampaign(env, owner, campaignId, Date.now() + HOUR)).rejects.toMatchObject({ status: 503 });
    expect(await getCampaign(env, owner, campaignId)).toMatchObject({ status: "draft" });
  });

  it("refuses a member schedule with 403", async () => {
    const { workspaceId, campaignId } = await readyFixture("cmp-403@example.com", "Cmp 403 Co");
    spyWorkflow();
    const cookie = await addMember(workspaceId, "cmp-403-member@example.com", "member");
    await expect(requireActor(env, headersFor(cookie), { permission: { campaign: ["send"] }, write: true })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a schedule two years out with 400 invalid schedule", async () => {
    const { owner, campaignId } = await readyFixture("cmp-far@example.com", "Cmp Far Co");
    spyWorkflow();
    await expect(scheduleCampaign(env, owner, campaignId, Date.now() + 730 * 86_400_000)).rejects.toMatchObject({
      status: 400,
      message: "invalid schedule",
    });
  });

  it("pauses and resumes, starting the new run as <id>-2", async () => {
    const { owner, campaignId } = await readyFixture("cmp-resume@example.com", "Cmp Resume Co");
    const { create, terminate } = spyWorkflow();
    await scheduleCampaign(env, owner, campaignId, Date.now() + HOUR);
    await clientFor(env, owner.workspaceId).startCampaign(owner.workspaceId, campaignId, 1);
    await pauseCampaign(env, owner, campaignId);
    expect(terminate).toHaveBeenCalled();
    expect(await resumeCampaign(env, owner, campaignId)).toEqual({ runSeq: 2 });
    expect(create).toHaveBeenLastCalledWith({
      id: `${campaignId}-2`,
      params: expect.objectContaining({ runSeq: 2, at: 0 }),
    });
  });

  it("cancels a paused campaign and reports the dropped count", async () => {
    const { owner, campaignId } = await readyFixture("cmp-cancel@example.com", "Cmp Cancel Co");
    spyWorkflow();
    await scheduleCampaign(env, owner, campaignId, Date.now() + HOUR);
    await clientFor(env, owner.workspaceId).startCampaign(owner.workspaceId, campaignId, 1);
    await pauseCampaign(env, owner, campaignId);
    expect(await cancelCampaign(env, owner, campaignId)).toEqual({ dropped: 0 });
    expect(await getCampaign(env, owner, campaignId)).toMatchObject({ status: "cancelled" });
  });

  it("sends a test only to the signed-in user's own address", async () => {
    const { owner, workspaceId, campaignId } = await readyFixture("cmp-test@example.com", "Cmp Test Co");
    const { messageId, status } = await testSendCampaign(env, owner, campaignId);
    expect(status).toBe("queued");
    const view = await clientFor(env, workspaceId).getMessage(workspaceId, messageId);
    expect(view).toMatchObject({ toEmail: "cmp-test@example.com", campaignId: null });
    expect(view?.subject).toMatch(/^\[Test\] /);
  });
});

describe("campaign stats console", () => {
  it("returns stats to a member and 404 across workspaces", async () => {
    const a = await workspaceFor("cmp-stats-a@example.com", "Stats A Co");
    const b = await workspaceFor("cmp-stats-b@example.com", "Stats B Co");
    const { id: appId } = await addApp(env, a.owner, { name: "Web", slug: "web" });
    const campaign = await createCampaign(env, a.owner, appId, { name: "Spring" });
    await expect(campaignStats(env, b.owner, campaign.id)).rejects.toMatchObject({ status: 404 });
    const cookie = await addMember(a.workspaceId, "cmp-stats-member@example.com", "member");
    const member = await requireActor(env, headersFor(cookie));
    expect(await campaignStats(env, member, campaign.id)).toMatchObject({ total: 0, queued: 0 });
  });
});

describe("hook-audience campaigns console", () => {
  it("refuses to schedule a hook campaign with no hook, and {{data.*}} in a lists campaign", async () => {
    const { owner } = await workspaceFor("cmp-hook@example.com", "Cmp Hook Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const campaign = await createCampaign(env, owner, appId, { name: "Hooked" });
    await expect(updateCampaign(env, owner, campaign.id, { subject: "Hi {{data.plan}}" })).rejects.toMatchObject({ status: 400 });
    await updateCampaign(env, owner, campaign.id, { audienceKind: "hook", audienceQuery: "all", subject: "Hi {{data.plan}}" });
    await expect(scheduleCampaign(env, owner, campaign.id, Date.now())).rejects.toThrow("audience_hook_missing");
  });

  it("refuses a hook-to-lists switch while the saved bodies use {{data.*}}", async () => {
    const { owner } = await workspaceFor("cmp-switch@example.com", "Cmp Switch Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const campaign = await createCampaign(env, owner, appId, { name: "Switched" });
    await updateCampaign(env, owner, campaign.id, { audienceKind: "hook", audienceQuery: "all", html: "<p>{{data.plan}}</p>", text: "{{data.plan}}" });
    await expect(updateCampaign(env, owner, campaign.id, { audienceKind: "lists" })).rejects.toMatchObject({ status: 409 });
    expect(
      campaignProblems(
        { fromEmail: "a@x.com", subject: "s", html: "{{data.plan}}", text: "x", listIds: ["l"], audienceKind: "lists", hookReady: false },
        "100 Main St",
      ),
    ).toContain("data_fields_need_hook");
  });
});
