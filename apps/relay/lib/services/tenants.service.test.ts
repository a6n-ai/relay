import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  rows: [] as { publicId: string; organizationId: string }[],
}));

vi.mock("@foundry/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@foundry/database")>();
  class FakeRepository {
    async findByPublicId(publicId: string) {
      return state.rows.find((r) => r.publicId === publicId) ?? null;
    }
  }
  return { ...actual, UpdatableRepository: FakeRepository };
});

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
vi.mock("@/lib/auth/active-org", () => ({
  requireActiveOrganizationId: async () => state.activeOrgId,
  getActiveOrganizationId: async () => state.activeOrgId,
}));

const { tenantsService } = await import("./tenants.service");

describe("tenantsService.read", () => {
  beforeEach(() => {
    state.activeOrgId = "org_a";
    state.rows = [
      { publicId: "tnt_a", organizationId: "org_a" },
      { publicId: "tnt_b", organizationId: "org_b" },
    ];
  });

  it("returns an app in the active workspace", async () => {
    await expect(tenantsService.read("tnt_a")).resolves.toMatchObject({ publicId: "tnt_a" });
  });

  it("reads another workspace's app as not found", async () => {
    await expect(tenantsService.read("tnt_b")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reads a missing app as not found", async () => {
    await expect(tenantsService.read("tnt_missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
