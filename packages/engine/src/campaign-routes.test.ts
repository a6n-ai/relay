import { describe, expect, it, vi } from "vitest";
import {
  claimForSend,
  duplicateCampaign,
  retriggerCampaign,
  retryFailedCampaign,
  scheduleDecision,
  setCampaignContent,
} from "./campaign-routes";

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
    });
    expect(result).toEqual({ error: "Campaign not found", status: 404 });
  });
});

function contentDeps(campaignRow: { id: bigint; status: string; systemKey?: string | null }, returned: { revision: number }[] = [{ revision: 1 }]) {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returned),
  };
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([campaignRow]) }),
    }),
    insert: vi.fn().mockReturnValue(insertChain),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deps = { db, tables: { campaign: {}, campaignContent: { revision: {} } }, users: {}, resolveSegment: vi.fn() } as any;
  return { deps, insertChain };
}

describe("setCampaignContent — sanitize, variables, revision", () => {
  const email = { channel: "email", locale: "en", subject: "Hi", html: "<p>hi</p>", preheader: "", revision: 0 };

  it("stores sanitized html and generated text, returning the new revision", async () => {
    const { deps, insertChain } = contentDeps({ id: 1n, status: "draft" }, [{ revision: 4 }]);
    const result = await setCampaignContent(deps, "cmp_1", { ...email, html: '<p onclick="x()">hi</p>', revision: 3 });
    expect(result).toEqual({ revision: 4, removed: ["onclick on <p>"], lint: [] });
    const values = insertChain.values.mock.calls[0][0];
    expect(values.html).toBe("<p>hi</p>");
    expect(values.text).toBe("hi");
  });

  it("409s when another tab saved first (no row returned)", async () => {
    const { deps } = contentDeps({ id: 1n, status: "draft" }, []);
    expect(await setCampaignContent(deps, "cmp_1", email)).toEqual({
      error: "This content was changed in another tab — reload to continue",
      status: 409,
    });
  });

  it("422s on unknown variables and does not write", async () => {
    const { deps, insertChain } = contentDeps({ id: 1n, status: "draft" });
    const result = await setCampaignContent(deps, "cmp_1", { ...email, subject: "Hi {{first_name}}" });
    expect(result).toEqual({ error: "Unknown variables: first_name", status: 422 });
    expect(insertChain.values).not.toHaveBeenCalled();
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

describe("retryFailedCampaign", () => {
  function retryDeps(campaignRow: { id: bigint } | undefined, requeued: number) {
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(Array.from({ length: requeued }, (_, i) => ({ id: BigInt(i) }))),
    };
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(campaignRow ? [campaignRow] : []),
        }),
      }),
      update: vi.fn().mockReturnValue(updateChain),
    };
    return { deps: { db, tables: { campaign: {}, notificationOutbox: {} } } as any, updateChain };
  }

  it("404s an unknown campaign without touching the outbox", async () => {
    const { deps } = retryDeps(undefined, 0);
    expect(await retryFailedCampaign(deps, "cmp_missing")).toEqual({ error: "Campaign not found", status: 404 });
    expect(deps.db.update).not.toHaveBeenCalled();
  });

  it("flips failed rows back to pending and reports how many", async () => {
    const { deps, updateChain } = retryDeps({ id: 7n }, 3);
    expect(await retryFailedCampaign(deps, "cmp_1")).toEqual({ requeued: 3 });
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
  });
});

describe("scheduleDecision", () => {
  const now = 1_000_000;
  it("schedules a draft for a future time", () => {
    expect(scheduleDecision({ status: "draft", scheduledAt: now + 60_000, now })).toEqual({ status: "scheduled", scheduledAt: now + 60_000 });
  });
  it("rejects a time that is not in the future", () => {
    expect(scheduleDecision({ status: "draft", scheduledAt: now, now })).toEqual({ error: "Pick a time in the future", status: 422 });
  });
  it("unschedules back to draft", () => {
    expect(scheduleDecision({ status: "scheduled", scheduledAt: null, now })).toEqual({ status: "draft", scheduledAt: null });
  });
  it("refuses once the campaign has left draft/scheduled", () => {
    expect(scheduleDecision({ status: "sending", scheduledAt: now + 1, now })).toMatchObject({ status: 409 });
  });
});

describe("claimForSend", () => {
  function fakeDb(returned: { id: bigint }[]) {
    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(returned) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { db: { update: vi.fn().mockReturnValue(chain) } as any, chain };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables = { campaign: { id: {}, publicId: {}, status: {} } } as any;

  it("returns the campaign id when this request made the transition", async () => {
    const { db, chain } = fakeDb([{ id: 7n }]);
    expect(await claimForSend(db, tables, "cmp_1")).toBe(7n);
    expect(chain.set).toHaveBeenCalledWith({ status: "sending" });
  });
  it("returns null when another request already claimed it", async () => {
    const { db } = fakeDb([]);
    expect(await claimForSend(db, tables, "cmp_1")).toBeNull();
  });
});
