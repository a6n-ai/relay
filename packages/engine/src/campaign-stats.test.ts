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

const outbox = { id: "id", campaignId: "cid", providerMessageId: "pmid", deliveredAt: "d", openedAt: "o" };
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

  it("clicks only count on the campaign", async () => {
    const { db, updates } = fakeDb({ id: 1n, campaignId: 9n });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordCampaignEvent({ db: db as any, tables }, "m-1", "clicked");
    expect(updates.map((u) => u.table)).toEqual([campaign]);
  });
});
