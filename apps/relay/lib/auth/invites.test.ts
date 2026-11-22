import { describe, expect, it, vi } from "vitest";

vi.stubEnv("BETTER_AUTH_URL", "https://relay.example.test");
vi.mock("@/db/client", () => ({ db: {} }));

const { inviteUrl, isInviteOpen } = await import("./invites");

describe("inviteUrl", () => {
  it("links to the accept page for the invitation id", () => {
    expect(inviteUrl("inv_123")).toBe("https://relay.example.test/accept-invitation/inv_123");
  });
});

describe("isInviteOpen", () => {
  const now = new Date("2026-11-22T12:00:00Z");

  it("accepts a pending invite that has not expired", () => {
    expect(isInviteOpen({ status: "pending", expiresAt: new Date("2026-11-23T12:00:00Z") }, now)).toBe(true);
  });

  it("refuses an expired invite", () => {
    expect(isInviteOpen({ status: "pending", expiresAt: new Date("2026-11-22T11:59:00Z") }, now)).toBe(false);
  });

  it("refuses an invite that was already accepted or cancelled", () => {
    expect(isInviteOpen({ status: "accepted", expiresAt: new Date("2026-11-23T12:00:00Z") }, now)).toBe(false);
    expect(isInviteOpen({ status: "canceled", expiresAt: new Date("2026-11-23T12:00:00Z") }, now)).toBe(false);
  });
});
