import { describe, expect, it, vi } from "vitest";
import {
  canClearSuppression,
  clearSuppression,
  normalizeAddress,
  suppress,
  suppressManually,
  suppressionKind,
} from "./suppression";

describe("normalizeAddress", () => {
  it("lowercases and trims an email", () => {
    expect(normalizeAddress("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("strips formatting from a phone number but keeps the plus", () => {
    expect(normalizeAddress("+1 (416) 555-0134")).toBe("+14165550134");
  });

  it("is idempotent", () => {
    expect(normalizeAddress(normalizeAddress("Foo@Bar.com"))).toBe("foo@bar.com");
  });
});

describe("canClearSuppression", () => {
  it("never lets an admin undo an unsubscribe", () => {
    expect(canClearSuppression("unsubscribe")).toBe(false);
  });
  it("allows clearing bounces, complaints and manual blocks", () => {
    expect(["bounce", "complaint", "manual"].map(canClearSuppression)).toEqual([true, true, true]);
  });
});

describe("suppressManually", () => {
  it("rejects an address that is neither an email nor a phone number", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { insert: vi.fn() } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await suppressManually(db, {} as any, { address: "nope", channel: "email" })).toEqual({
      error: "Enter a valid email address",
      status: 422,
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("never overwrites an existing row, so an unsubscribe cannot be relabelled and then cleared", async () => {
    const chain = { values: vi.fn().mockReturnThis(), onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { insert: vi.fn().mockReturnValue(chain) } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await suppressManually(db, { messageSuppression: {} } as any, { address: "A@x.com", channel: "email" })).toEqual({ ok: true });
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ address: "a@x.com", reason: "manual", scope: "marketing", source: "admin" }),
    );
    expect(chain.onConflictDoNothing).toHaveBeenCalled();
  });
});

describe("clearSuppression", () => {
  function fakeDb(deleted: { id: bigint }[], existing: { id: bigint }[]) {
    const del = { where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(deleted) };
    const sel = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(existing) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { db: { delete: vi.fn().mockReturnValue(del), select: vi.fn().mockReturnValue(sel) } as any, del };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables = { messageSuppression: { id: {}, publicId: {}, reason: {} } } as any;

  it("deletes in one conditional statement — no read-then-delete window for an unsubscribe to land in", async () => {
    const { db, del } = fakeDb([{ id: 1n }], []);
    expect(await clearSuppression(db, tables, "msp_1")).toEqual({ ok: true });
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(del.returning).toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
  it("refuses when the row is an unsubscribe", async () => {
    const { db } = fakeDb([], [{ id: 1n }]);
    expect(await clearSuppression(db, tables, "msp_1")).toMatchObject({ status: 409 });
  });
  it("reports a missing row", async () => {
    const { db } = fakeDb([], []);
    expect(await clearSuppression(db, tables, "msp_1")).toMatchObject({ status: 404 });
  });
});

describe("suppress", () => {
  function fakeDb() {
    const chain = { values: vi.fn().mockReturnThis(), onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { db: { insert: vi.fn().mockReturnValue(chain) } as any, chain };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables = { messageSuppression: { address: {}, channel: {}, scope: {}, reason: {} } } as any;

  it("never relabels an existing unsubscribe as another reason (which would make it clearable)", async () => {
    const { db, chain } = fakeDb();
    await suppress(db, tables, { address: "a@x.com", channel: "email", reason: "manual", scope: "marketing" });
    expect(chain.onConflictDoUpdate.mock.calls[0]![0].setWhere).toBeDefined();
  });
  it("lets an unsubscribe overwrite any earlier reason", async () => {
    const { db, chain } = fakeDb();
    await suppress(db, tables, { address: "a@x.com", channel: "email", reason: "unsubscribe", scope: "marketing" });
    expect(chain.onConflictDoUpdate.mock.calls[0]![0].setWhere).toBeUndefined();
  });
});

describe("suppressionKind — the reasons production actually stores", () => {
  it("treats an SMS STOP as the recipient's own decision, never clearable", () => {
    expect(suppressionKind("sms STOP keyword")).toBe("unsubscribe");
    expect(canClearSuppression("sms STOP keyword")).toBe(false);
  });
  it("classifies provider feedback", () => {
    expect(suppressionKind("SES hard bounce")).toBe("bounce");
    expect(suppressionKind("carrier undeliverable 30006")).toBe("bounce");
    expect(suppressionKind("SES complaint")).toBe("complaint");
    expect(["SES hard bounce", "carrier undeliverable 30006", "SES complaint"].map(canClearSuppression)).toEqual([true, true, true]);
  });
  it("never clears a reason it does not recognise", () => {
    expect(suppressionKind("something new")).toBe("other");
    expect(canClearSuppression("something new")).toBe(false);
  });
  it("lets a STOP overwrite, and protects it from a later carrier write", async () => {
    const chain = { values: vi.fn().mockReturnThis(), onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { insert: vi.fn().mockReturnValue(chain) } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tables = { messageSuppression: { address: {}, channel: {}, scope: {}, reason: {} } } as any;
    await suppress(db, tables, { address: "+14165550100", channel: "sms", reason: "sms STOP keyword" });
    expect(chain.onConflictDoUpdate.mock.calls[0]![0].setWhere).toBeUndefined();
    await suppress(db, tables, { address: "+14165550100", channel: "sms", reason: "carrier undeliverable 30006" });
    expect(chain.onConflictDoUpdate.mock.calls[1]![0].setWhere).toBeDefined();
  });
});

describe("suppress — repeat unsubscribe keeps the first attribution", () => {
  it("does not overwrite campaign and source with plain values", async () => {
    const chain = { values: vi.fn().mockReturnThis(), onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { insert: vi.fn().mockReturnValue(chain) } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tables = { messageSuppression: { address: {}, channel: {}, scope: {}, reason: {}, campaignId: {}, source: {} } } as any;
    await suppress(db, tables, { address: "a@x.com", channel: "email", reason: "unsubscribe", scope: "marketing", source: "one-click" });
    const set = chain.onConflictDoUpdate.mock.calls[0]![0].set;
    expect(set.campaignId).not.toBeNull();
    expect(typeof set.source).toBe("object");
  });
});
