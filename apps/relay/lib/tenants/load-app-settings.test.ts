import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  read: vi.fn(),
  activeOrg: vi.fn(async () => "org_a"),
}));

vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { read: (...a: unknown[]) => h.read(...a) },
}));
vi.mock("@/lib/auth/active-org", () => ({
  requireActiveOrganizationId: () => h.activeOrg(),
}));

const { loadAppSettings } = await import("./load-app-settings");

describe("loadAppSettings", () => {
  beforeEach(() => {
    h.read.mockReset();
    h.activeOrg.mockResolvedValue("org_a");
  });

  it("returns null for another workspace's app", async () => {
    h.read.mockResolvedValue({ publicId: "ctn_1", organizationId: "org_b", name: "Other" });
    await expect(loadAppSettings("ctn_1")).resolves.toBeNull();
  });

  it("returns the app in the active workspace", async () => {
    h.read.mockResolvedValue({ publicId: "ctn_1", organizationId: "org_a", name: "Mine" });
    await expect(loadAppSettings("ctn_1")).resolves.toEqual({
      tenant: expect.objectContaining({ name: "Mine" }),
    });
  });

  it("returns null when the app is missing", async () => {
    h.read.mockRejectedValue(new Error("Not found"));
    await expect(loadAppSettings("ctn_missing")).resolves.toBeNull();
  });
});
