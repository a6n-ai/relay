import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  countSends: vi.fn(async (..._args: unknown[]) => 7),
}));

vi.mock("@/db/client", () => {
  const rows = () => [{ name: "a6n", maxApps: 0, monthlyMessageQuota: 0, apps: 0 }];
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => Object.assign(Promise.resolve(rows()), { limit: async () => rows() }),
        }),
      }),
    },
  };
});
vi.mock("@/lib/auth/guards", () => ({ requirePagePermission: async () => undefined }));
vi.mock("@/lib/auth/active-org", () => ({ requireActiveOrganizationId: async () => "org_x" }));
vi.mock("@/lib/tenants/usage", () => ({
  countOrganizationSendsThisMonth: (...a: unknown[]) => h.countSends(...a),
}));

const { default: GeneralSettingsPage } = await import("./page");

describe("General settings page", () => {
  beforeEach(() => h.countSends.mockClear());

  it("counts only sent mail, the same way the send limit check does", async () => {
    await GeneralSettingsPage();
    expect(h.countSends).toHaveBeenCalledWith("org_x", undefined, "sent");
  });
});
