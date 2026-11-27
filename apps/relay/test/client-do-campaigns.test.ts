import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SesEventJob } from "../src/core/ses-events";
import { ensureWorkspaceProfile } from "../src/core/workspace-profile";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import { applyMigrations, seedVerifiedSender } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

const stubFor = (ws: string) => env.CLIENT.get(env.CLIENT.idFromName(ws));
const DAY = 86_400_000;

const refused = (call: Promise<unknown>) => call.then(() => "resolved", (e: Error) => e.message);

describe("campaign drafts in the workspace DO", () => {
  it("creates a draft, then updates its lists from the same app", async () => {
    const ws = "ws_camp_update";
    const stub = stubFor(ws);
    const campaign = ((await stub.createCampaign(ws, "app_1", "Spring")) as { id: string });
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "express_optin" });
    const updated = await stub.updateCampaign(ws, campaign.id, { listIds: [list.id], subject: "Hi" });
    expect(updated).toMatchObject({ status: "draft", listIds: [list.id], subject: "Hi" });
  });

  it("refuses a list that belongs to another app with unknown list", async () => {
    const ws = "ws_camp_badlist";
    const stub = stubFor(ws);
    const campaign = ((await stub.createCampaign(ws, "app_1", "C")) as { id: string });
    const other = await stub.createList(ws, "app_2", { name: "Other", consentSource: "express_optin" });
    expect(await refused(stub.updateCampaign(ws, campaign.id, { listIds: [other.id] }))).toBe("unknown list");
  });

  it("refuses to edit a campaign that is no longer a draft", async () => {
    const ws = "ws_camp_notdraft";
    const stub = stubFor(ws);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO campaign (id, app_id, name, status, created_at, updated_at) VALUES ('cmp_scheduled002', 'app_1', 'S', 'scheduled', 1, 1)",
      );
    });
    expect(await refused(stub.updateCampaign(ws, "cmp_scheduled002", { name: "Renamed" }))).toBe("campaign not editable");
    expect(await stub.getCampaign(ws, "cmp_scheduled002")).toMatchObject({ status: "scheduled", name: "S" });
  });

  it("counts a member on two lists once, and a suppressed member as suppressed", async () => {
    const ws = "ws_camp_preview";
    const stub = stubFor(ws);
    const first = await stub.createList(ws, "app_1", { name: "A", consentSource: "express_optin" });
    const second = await stub.createList(ws, "app_1", { name: "B", consentSource: "express_optin" });
    await stub.addMember(ws, first.id, { email: "a@x.com" });
    await stub.addMember(ws, first.id, { email: "b@x.com" });
    await stub.addMember(ws, second.id, { email: "a@x.com" });
    expect(await stub.previewAudience(ws, "app_1", [first.id, second.id], null)).toEqual({
      members: 2,
      suppressed: 0,
      lapsed: 0,
      sendable: 2,
    });
    await stub.addSuppression(ws, "b@x.com", "manual", "marketing");
    expect(await stub.previewAudience(ws, "app_1", [first.id, second.id], null)).toMatchObject({ suppressed: 1, sendable: 1 });
  });

  it("counts a per-domain opt-out as suppressed only for that sending domain", async () => {
    const ws = "ws_camp_optout";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "A", consentSource: "express_optin" });
    await stub.addMember(ws, list.id, { email: "o@x.com" });
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("INSERT INTO marketing_optout (email, domain, created_at) VALUES ('o@x.com', 'a.test', 1)");
    });
    expect(await stub.previewAudience(ws, "app_1", [list.id], "news@a.test")).toMatchObject({ suppressed: 1, sendable: 0 });
    expect(await stub.previewAudience(ws, "app_1", [list.id], "news@b.test")).toMatchObject({ suppressed: 0, sendable: 1 });
  });

  it("counts a subdomain's opt-out against its whole brand", async () => {
    const ws = "ws_camp_brand";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "B", consentSource: "express_optin" });
    await stub.addMember(ws, list.id, { email: "o@x.com" });
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("INSERT INTO marketing_optout (email, domain, created_at) VALUES ('o@x.com', 'brand.co.uk', 1)");
    });
    expect(await stub.previewAudience(ws, "app_1", [list.id], "news@shop.brand.co.uk")).toMatchObject({ suppressed: 1, sendable: 0 });
    expect(await stub.previewAudience(ws, "app_1", [list.id], "news@brand-b.co.uk")).toMatchObject({ suppressed: 0, sendable: 1 });
  });

  it("applies the 730-day rule to purchase lists only", async () => {
    const ws = "ws_camp_lapse";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "P", consentSource: "purchase" });
    await stub.addMember(ws, list.id, { email: "old@x.com", consentAt: Date.now() - 731 * DAY });
    await stub.addMember(ws, list.id, { email: "new@x.com", consentAt: Date.now() - 729 * DAY });
    expect(await stub.previewAudience(ws, "app_1", [list.id], null)).toEqual({ members: 2, suppressed: 0, lapsed: 1, sendable: 1 });
  });

  it("pages campaign summaries at 50", async () => {
    const ws = "ws_camp_page";
    const stub = stubFor(ws);
    for (let i = 0; i < 51; i++) ((await stub.createCampaign(ws, "app_1", `C${i}`)) as { id: string });
    const first = await stub.listCampaigns(ws);
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0]).not.toHaveProperty("html");
    const second = await stub.listCampaigns(ws, first.nextCursor ?? undefined);
    expect(second.rows).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});

describe("campaign live counters", () => {
  const BODY = {
    subject: "Hi {{contact.first_name}}",
    html: '<p>Hi {{contact.first_name}}</p><p>{{postal_address}}</p><a href="{{unsubscribe_url}}">Unsubscribe</a>',
    text: "Hi {{contact.first_name}} {{postal_address}} {{unsubscribe_url}}",
    fromEmail: "relay@a6n.ai",
  };
  const EMAILS = ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"];

  beforeEach(() => {
    vi.spyOn(env.SEND, "sendBatch").mockResolvedValue({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } } as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function queuedCampaign(name: string) {
    const ws = `ws_stats_${name}`;
    await securityDb(env).insert(workspace).values({ id: ws, name: ws, slug: ws });
    await seedVerifiedSender(ws);
    await ensureWorkspaceProfile(env, ws);
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "express_optin" });
    for (const email of EMAILS) await stub.addMember(ws, list.id, { email });
    const c = ((await stub.createCampaign(ws, "app_1", "C")) as { id: string });
    await stub.updateCampaign(ws, c.id, { ...BODY, listIds: [list.id] });
    const scheduled = await stub.scheduleCampaign(ws, c.id, 0, "1 Main St");
    if (typeof scheduled !== "object" || !("runSeq" in scheduled)) throw new Error("not scheduled");
    expect(await stub.startCampaign(ws, c.id, scheduled.runSeq)).toBe("go");
    await stub.campaignChunk(ws, c.id, scheduled.runSeq);
    const msgs = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ id: string; email: string }>("SELECT id, to_email AS email FROM message WHERE campaign_id = ? ORDER BY to_email", c.id).toArray(),
    );
    return { ws, stub, id: c.id, msgs };
  }

  it("bumps each counter once per message and matches a recount", async () => {
    const { ws, stub, id, msgs } = await queuedCampaign("main");
    for (const i of [0, 1, 2, 3]) {
      expect(await stub.claimSend(ws, msgs[i].id)).toMatchObject({ kind: "send" });
      expect(await stub.markSent(ws, msgs[i].id, `ses-${i}`)).toBe(true);
    }
    expect(await stub.markSent(ws, msgs[0].id, "ses-0")).toBe(false);

    const ev = (i: number, type: SesEventJob["type"], sns: string, extra: Partial<SesEventJob> = {}): SesEventJob => ({
      workspaceId: ws,
      messageId: msgs[i].id,
      sesMessageId: `ses-${i}`,
      snsMessageId: sns,
      type,
      occurredAt: 1,
      recipients: [msgs[i].email],
      ...extra,
    });
    await stub.applySesEvents(ws, [
      ev(0, "Delivery", "d0"),
      ev(1, "Delivery", "d1"),
      ev(2, "Delivery", "d2"),
      ev(0, "Delivery", "d0"),
      ev(0, "Open", "o1"),
      ev(0, "Open", "o2"),
      ev(0, "Click", "c1", { link: "https://x.test" }),
      ev(3, "Bounce", "b3", { bounceType: "Permanent" }),
      ev(1, "Complaint", "k1"),
    ]);
    await stub.unsubscribe(ws, msgs[0].id);
    await stub.unsubscribe(ws, msgs[0].id);
    await stub.markSendFailed(ws, msgs[4].id, "boom", true);

    const expected = {
      total: 5,
      sent: 4,
      delivered: 3,
      opened: 1,
      clicked: 1,
      bounced: 1,
      complained: 1,
      unsubscribed: 1,
      queued: 0,
      failed: 1,
      suppressed: 0,
    };
    expect(await stub.campaignStats(ws, id)).toEqual(expected);
    const recount = await stub.recountCampaign(ws, id);
    expect(recount?.before).toEqual(expected);
    expect(recount?.after).toEqual(expected);
  });

  it("a lapsed claim's failure does not repaint a row suppressed meanwhile, nor move a counter", async () => {
    const { ws, stub, id, msgs } = await queuedCampaign("lapse");
    await stub.addSuppression(ws, EMAILS[1], "manual", "marketing");
    expect(await stub.claimSend(ws, msgs[1].id)).toMatchObject({ kind: "skip", reason: "suppressed" });
    const before = await stub.campaignStats(ws, id);

    await stub.markSendFailed(ws, msgs[1].id, "lapsed lease", true);

    expect(await stub.getMessage(ws, msgs[1].id)).toMatchObject({ status: "suppressed" });
    expect(await stub.campaignStats(ws, id)).toEqual(before);
    expect(before).toMatchObject({ queued: 4, suppressed: 1, failed: 0 });
  });

  it("recount reports drift, rewrites the row, and campaignStats reads the true value", async () => {
    const { ws, stub, id } = await queuedCampaign("drift");
    await runInDurableObject(stub, (_instance, state) => state.storage.sql.exec("UPDATE campaign SET queued = 0 WHERE id = ?", id));
    const recount = await stub.recountCampaign(ws, id);
    expect(recount?.before).toMatchObject({ queued: 0, total: 0 });
    expect(recount?.after).toMatchObject({ queued: 5, total: 5 });
    expect(await stub.campaignStats(ws, id)).toMatchObject({ queued: 5 });
  });

  it("moves a claim-time suppression from queued to suppressed, and ignores non-campaign mail", async () => {
    const { ws, stub, id, msgs } = await queuedCampaign("suppress");
    await stub.addSuppression(ws, msgs[0].email, "manual", "marketing");
    expect(await stub.claimSend(ws, msgs[0].id)).toEqual({ kind: "skip", reason: "suppressed" });
    expect(await stub.campaignStats(ws, id)).toMatchObject({ queued: 4, suppressed: 1, total: 5 });

    await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, event, from_email, from_name, ses_region, to_email, subject, attempts, opens, clicks, created_at, updated_at) VALUES ('msg_plain', 'app_1', 'out', 'transactional', 'queued', 'transactional', 'relay@a6n.ai', 'A', 'ap-south-1', 'z@x.com', 'S', 0, 0, 0, 0, 0)",
      ),
    );
    expect(await stub.claimSend(ws, "msg_plain")).toMatchObject({ kind: "send" });
    expect(await stub.markSent(ws, "msg_plain", "ses-plain")).toBe(true);
    expect(await stub.campaignStats(ws, id)).toMatchObject({ queued: 4, suppressed: 1, sent: 0, total: 5 });
  });

  it("returns null for an unknown campaign", async () => {
    const stub = stubFor("ws_stats_unknown");
    expect(await stub.campaignStats("ws_stats_unknown", "cmp_nope000000000")).toBeNull();
    expect(await stub.recountCampaign("ws_stats_unknown", "cmp_nope000000000")).toBeNull();
  });
});
