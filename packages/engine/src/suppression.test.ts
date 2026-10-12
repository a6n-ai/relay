import { describe, expect, it, vi } from "vitest";
import { canClearSuppression, normalizeAddress, suppressManually } from "./suppression";

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
