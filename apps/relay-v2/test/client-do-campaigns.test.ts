import { env, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

const stubFor = (ws: string) => env.CLIENT.get(env.CLIENT.idFromName(ws));
const DAY = 86_400_000;

describe("campaign drafts in the workspace DO", () => {
  it("creates a draft, then updates its lists from the same app", async () => {
    const ws = "ws_camp_update";
    const stub = stubFor(ws);
    const campaign = await stub.createCampaign(ws, "app_1", "Spring");
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "express_optin" });
    const updated = await stub.updateCampaign(ws, campaign.id, { listIds: [list.id], subject: "Hi" });
    expect(updated).toMatchObject({ status: "draft", listIds: [list.id], subject: "Hi" });
  });

  it("refuses a list that belongs to another app with bad_list", async () => {
    const ws = "ws_camp_badlist";
    const stub = stubFor(ws);
    const campaign = await stub.createCampaign(ws, "app_1", "C");
    const other = await stub.createList(ws, "app_2", { name: "Other", consentSource: "express_optin" });
    expect(await stub.updateCampaign(ws, campaign.id, { listIds: [other.id] })).toBe("bad_list");
  });

  it("refuses to edit a campaign that is no longer a draft", async () => {
    const ws = "ws_camp_notdraft";
    const stub = stubFor(ws);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO campaign (id, app_id, name, status, created_at, updated_at) VALUES ('cmp_scheduled002', 'app_1', 'S', 'scheduled', 1, 1)",
      );
    });
    expect(await stub.updateCampaign(ws, "cmp_scheduled002", { name: "Renamed" })).toBe("not_draft");
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
    for (let i = 0; i < 51; i++) await stub.createCampaign(ws, "app_1", `C${i}`);
    const first = await stub.listCampaigns(ws);
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0]).not.toHaveProperty("html");
    const second = await stub.listCampaigns(ws, first.nextCursor ?? undefined);
    expect(second.rows).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});
