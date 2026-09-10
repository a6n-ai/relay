import { describe, expect, it, vi } from "vitest";
import { duplicateCampaign, retriggerCampaign, setCampaignContent } from "./campaign-routes";

function fakeDeps(campaignRow: { id: bigint; status: string } | undefined) {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(campaignRow ? [campaignRow] : []),
      }),
    }),
    insert: vi.fn().mockReturnValue(insertChain),
  };
  return { db, tables: { campaign: {}, campaignContent: {} }, users: {}, resolveSegment: vi.fn() } as any;
}

describe("setCampaignContent", () => {
  it("rejects editing content on a sent campaign", async () => {
    const deps = fakeDeps({ id: 1n, status: "sent" });
    const result = await setCampaignContent(deps, "cmp_1", {
      channel: "email",
      locale: "en",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result).toEqual({
      error: "Content can only be edited while a campaign is draft or scheduled",
      status: 409,
    });
  });

  it("404s when the campaign does not exist", async () => {
    const deps = fakeDeps(undefined);
    const result = await setCampaignContent(deps, "cmp_missing", {
      channel: "email",
      locale: "en",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result).toEqual({ error: "Campaign not found", status: 404 });
  });
});

describe("duplicateCampaign", () => {
  it("404s when the campaign does not exist", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    };
    const deps = { db, tables: { campaign: {}, campaignContent: {} }, users: {}, resolveSegment: vi.fn() } as any;
    const result = await duplicateCampaign(deps, "cmp_missing");
    expect(result).toEqual({ error: "Campaign not found", status: 404 });
  });

  it("clones name, channels, audience and content into a new draft", async () => {
    const source = { id: 1n, name: "Diwali sale", channels: ["email"], audience: { listIds: ["ctl_1"] } };
    const content = [{ channel: "email", locale: "en", subject: "Hi", body: null, html: "<p>hi</p>", text: "hi", providerTemplateId: null }];
    let selectCall = 0;
    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCall += 1;
            return Promise.resolve(selectCall === 1 ? [source] : content);
          }),
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 2n, publicId: "cmp_copy" }]),
      }),
    };
    const deps = { db, tables: { campaign: {}, campaignContent: {} }, users: {}, resolveSegment: vi.fn() } as any;

    const result = await duplicateCampaign(deps, "cmp_1");
    expect(result).toEqual({ publicId: "cmp_copy" });
    expect(db.insert).toHaveBeenCalledTimes(2); // campaign row + content rows
  });
});

describe("retriggerCampaign", () => {
  it("404s when the campaign does not exist", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    };
    const deps = { db, tables: { campaign: {}, campaignContent: {} }, users: {}, resolveSegment: vi.fn() } as any;
    const result = await retriggerCampaign(deps, "cmp_missing");
    expect(result).toEqual({ error: "Campaign not found", status: 404 });
  });
});
