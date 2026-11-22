import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ acceptInvitation: vi.fn(), setActiveOrganization: vi.fn() }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      acceptInvitation: (...a: unknown[]) => h.acceptInvitation(...a),
      setActiveOrganization: (...a: unknown[]) => h.setActiveOrganization(...a),
    },
  },
}));

const { acceptInvitationAction } = await import("./actions");

describe("acceptInvitationAction", () => {
  beforeEach(() => {
    h.acceptInvitation.mockReset().mockResolvedValue({ invitation: { organizationId: "org_invited" }, member: {} });
    h.setActiveOrganization.mockReset().mockResolvedValue({});
  });

  it("accepts the invitation by id", async () => {
    await expect(acceptInvitationAction("inv_1")).resolves.toEqual({});
    expect(h.acceptInvitation).toHaveBeenCalledWith(expect.objectContaining({ body: { invitationId: "inv_1" } }));
  });

  it("accept with a different signed-in email returns the mismatch error", async () => {
    h.acceptInvitation.mockRejectedValue(new Error("You are not the recipient of the invitation"));
    await expect(acceptInvitationAction("inv_1")).resolves.toEqual({ error: "This invite is for a different email" });
  });

  it("maps an invalid or used invite to the expired copy", async () => {
    h.acceptInvitation.mockRejectedValue(new Error("Invitation not found"));
    await expect(acceptInvitationAction("inv_1")).resolves.toEqual({
      error: "This invite has expired or was already used",
    });
  });

  it("sets the invited workspace active so /dashboard lands in it", async () => {
    await acceptInvitationAction("inv_1");

    expect(h.setActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: "org_invited" } }),
    );
  });
});
