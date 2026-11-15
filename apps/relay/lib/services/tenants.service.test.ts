import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  rows: [] as { publicId: string; organizationId: string }[],
  writes: [] as string[],
}));

vi.mock("@foundry/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@foundry/database")>();
  class FakeRepository {
    async findByPublicId(publicId: string) {
      return state.rows.find((r) => r.publicId === publicId) ?? null;
    }
    async updateByPublicId(publicId: string, patch: Record<string, unknown>) {
      state.writes.push(`update:${publicId}`);
      return { ...state.rows.find((r) => r.publicId === publicId), ...patch };
    }
    async deleteByPublicId(publicId: string) {
      state.writes.push(`delete:${publicId}`);
      return 1;
    }
  }
  return { ...actual, UpdatableRepository: FakeRepository };
});

vi.mock("@/db/client", () => ({ db: { insert: () => ({ values: async () => {} }) } }));
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

describe("tenantsService.update and delete", () => {
  beforeEach(() => {
    state.activeOrgId = "org_a";
    state.rows = [
      { publicId: "tnt_a", organizationId: "org_a" },
      { publicId: "tnt_b", organizationId: "org_b" },
    ];
    state.writes = [];
  });

  it("rejects updating another workspace's app before any write", async () => {
    await expect(tenantsService.update("tnt_b", { monthlyMessageQuota: 1 })).rejects.toBeInstanceOf(NotFoundError);
    expect(state.writes).toEqual([]);
  });

  it("rejects deleting another workspace's app before any write", async () => {
    await expect(tenantsService.delete("tnt_b")).rejects.toBeInstanceOf(NotFoundError);
    expect(state.writes).toEqual([]);
  });

  it("updates an app in the active workspace", async () => {
    await expect(tenantsService.update("tnt_a", { monthlyMessageQuota: 1 })).resolves.toMatchObject({
      publicId: "tnt_a",
      monthlyMessageQuota: 1,
    });
    expect(state.writes).toEqual(["update:tnt_a"]);
  });

  it("deletes an app in the active workspace", async () => {
    await expect(tenantsService.delete("tnt_a")).resolves.toBe(1);
    expect(state.writes).toEqual(["delete:tnt_a"]);
  });
});
