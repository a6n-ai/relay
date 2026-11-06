import { describe, expect, it, vi } from "vitest";
import { recordCampaignEvent } from "./campaign-stats";

function fakeDb(row: { id: bigint; campaignId: bigint | null } | undefined) {
  const updates: { table: unknown; set: Record<string, unknown> }[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (row ? [row] : []) }) }) }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: vi.fn(async () => updates.push({ table, set })),
      }),
    }),
  };
  return { db, updates };
}

const outbox = { id: "id", campaignId: "cid", providerMessageId: "pmid", deliveredAt: "d", openedAt: "o", clickedAt: "c", bouncedAt: "b", complainedAt: "cm", delayedAt: "dl", rejectedAt: "r", renderFailedAt: "rf" };
const campaign = { id: "id", counts: "counts" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tables = { notificationOutbox: outbox, campaign } as any;

describe("recordCampaignEvent", () => {
  it("stamps openedAt on a transactional row and touches no campaign", async () => {
    const { db, updates } = fakeDb({ id: 1n, campaignId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordCampaignEvent({ db: db as any, tables }, "m-1", "opened");
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe(outbox);
    expect(Object.keys(updates[0].set)).toEqual(["openedAt"]);
  });

  it("stamps the row and bumps campaign counts for a campaign row", async () => {
    const { db, updates } = fakeDb({ id: 1n, campaignId: 9n });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordCampaignEvent({ db: db as any, tables }, "m-1", "delivered");
    expect(updates.map((u) => u.table)).toEqual([outbox, campaign]);
    expect(Object.keys(updates[0].set)).toEqual(["deliveredAt"]);
  });

  it("clicks stamp the row and count on the campaign", async () => {
    const { db, updates } = fakeDb({ id: 1n, campaignId: 9n });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordCampaignEvent({ db: db as any, tables }, "m-1", "clicked");
    expect(updates.map((u) => u.table)).toEqual([outbox, campaign]);
  });

  it.each([
    ["delivered", "deliveredAt"],
    ["opened", "openedAt"],
    ["clicked", "clickedAt"],
    ["bounced", "bouncedAt"],
    ["complained", "complainedAt"],
    ["delayed", "delayedAt"],
    ["rejected", "rejectedAt"],
    ["render_failed", "renderFailedAt"],
  ])("%s stamps only %s, coalescing the existing value", async (type, col) => {
    const { db, updates } = fakeDb({ id: 1n, campaignId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordCampaignEvent({ db: db as any, tables }, "m-1", type);
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].set)).toEqual([col]);
  });

  it("opened before delivered stamps each column independently", async () => {
    const { db, updates } = fakeDb({ id: 1n, campaignId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps = { db: db as any, tables };
    await recordCampaignEvent(deps, "m-1", "opened");
    await recordCampaignEvent(deps, "m-1", "delivered");
    expect(updates.map((u) => Object.keys(u.set)[0])).toEqual(["openedAt", "deliveredAt"]);
  });

  it("unknown type does not stamp the row", async () => {
    const { db, updates } = fakeDb({ id: 1n, campaignId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordCampaignEvent({ db: db as any, tables }, "m-1", "bogus");
    expect(updates).toHaveLength(0);
  });
});
