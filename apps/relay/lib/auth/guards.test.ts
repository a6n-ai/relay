import { describe, expect, it, vi } from "vitest";

const fresh = vi.fn(async () => null);
const cached = vi.fn(async () => null);
vi.mock("./session", () => ({ getFreshSession: () => fresh(), getSession: () => cached() }));

const { requireAdmin } = await import("./guards");
const { operatorGuard } = await import("@/lib/campaigns/http");

describe("mutation guards", () => {
  it.each([
    ["requireAdmin", () => requireAdmin()],
    ["operatorGuard", () => operatorGuard()],
  ])("%s checks the live session, never the cookie cache", async (_n, guard) => {
    fresh.mockClear();
    cached.mockClear();
    await guard().catch(() => {});
    expect(fresh).toHaveBeenCalled();
    expect(cached).not.toHaveBeenCalled();
  });
});
