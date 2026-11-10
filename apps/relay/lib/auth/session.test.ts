import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGetSession = vi.fn();
vi.mock("./index", () => ({ auth: { api: { getSession: (a: unknown) => apiGetSession(a) } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "x=1" }) }));

const { getFreshSession, getSession } = await import("./session");

describe("session reads", () => {
  beforeEach(() => {
    apiGetSession.mockReset();
    apiGetSession.mockResolvedValue({ user: { id: "1", publicId: "usr_1", email: "a@b.co" } });
  });

  it("page views may use the 5 minute cookie cache", async () => {
    await getSession();
    expect(apiGetSession.mock.calls[0][0]).not.toHaveProperty("query");
  });

  it("guards read the session from the database, so a revoked session stops at once", async () => {
    const s = await getFreshSession();
    expect(apiGetSession.mock.calls[0][0]).toMatchObject({ query: { disableCookieCache: true } });
    expect(s?.user.id).toBe("usr_1");
  });
});
