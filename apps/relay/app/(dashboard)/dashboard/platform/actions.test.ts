import { beforeEach, describe, expect, it, vi } from "vitest";
import { organization, users } from "@/db/schema";

const h = vi.hoisted(() => ({
  existingUsers: [] as { id: bigint; banned: boolean | null }[],
  updates: [] as { table: unknown; values: unknown }[],
  createUser: vi.fn(),
  createOrganization: vi.fn(),
  requirePlatformAdmin: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "x=1" }) }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { createUser: h.createUser, createOrganization: h.createOrganization } },
}));
vi.mock("@/lib/auth/org-scope", () => ({ requirePlatformAdmin: h.requirePlatformAdmin }));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => h.existingUsers }) }) }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          h.updates.push({ table, values });
        },
      }),
    }),
  },
}));

const { createClientAction } = await import("./actions");

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base = {
    name: "Acme",
    slug: "acme",
    ownerEmail: "Owner@Acme.com",
    monthlyMessageQuota: "100",
    maxApps: "3",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

describe("createClientAction", () => {
  beforeEach(() => {
    h.existingUsers = [];
    h.updates = [];
    h.createUser.mockReset().mockResolvedValue({ user: { id: "9" } });
    h.createOrganization.mockReset().mockResolvedValue({ id: "org_1" });
    h.requirePlatformAdmin.mockReset().mockResolvedValue(undefined);
  });

  it("creates the workspace session-less, so the owner is its member and the admin is not", async () => {
    h.existingUsers = [{ id: 7n, banned: false }];

    const result = await createClientAction(form());

    expect(result).toEqual({ id: "org_1", ownerEmail: "owner@acme.com" });
    expect(h.createOrganization).toHaveBeenCalledTimes(1);
    const call = h.createOrganization.mock.calls[0][0];
    expect(call).not.toHaveProperty("headers");
    expect(call.body).toMatchObject({ name: "Acme", slug: "acme", userId: "7" });
    expect(h.updates).toContainEqual({
      table: organization,
      values: { monthlyMessageQuota: 100, maxApps: 3 },
    });
  });

  it("reuses an existing user with that email", async () => {
    h.existingUsers = [{ id: 7n, banned: false }];

    await createClientAction(form());

    expect(h.createUser).not.toHaveBeenCalled();
  });

  it("refuses a banned existing owner and creates nothing", async () => {
    h.existingUsers = [{ id: 7n, banned: true }];

    const result = await createClientAction(form());

    expect(result).toEqual({ error: "That user is banned and can't own a workspace." });
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.createOrganization).not.toHaveBeenCalled();
    expect(h.updates).toEqual([]);
  });

  it("creates the owner with the admin's headers when no user has that email", async () => {
    const result = await createClientAction(form());

    expect(result).toEqual({ id: "org_1", ownerEmail: "owner@acme.com" });
    expect(h.createUser).toHaveBeenCalledTimes(1);
    expect(h.createUser.mock.calls[0][0].body).toEqual({ email: "owner@acme.com", name: "owner" });
    expect(h.createOrganization.mock.calls[0][0].body).toMatchObject({ userId: "9" });
    expect(h.updates).toContainEqual({ table: users, values: { passwordSet: false } });
  });

  it("returns the error and creates nothing when the owner email is missing", async () => {
    const result = await createClientAction(form({ ownerEmail: "  " }));

    expect(result).toEqual({ error: "Owner email is required." });
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.createOrganization).not.toHaveBeenCalled();
    expect(h.updates).toEqual([]);
  });

  it("returns the error and creates nothing when the owner email is invalid", async () => {
    const result = await createClientAction(form({ ownerEmail: "not-an-email" }));

    expect(result).toEqual({ error: "Enter a valid owner email." });
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.createOrganization).not.toHaveBeenCalled();
    expect(h.updates).toEqual([]);
  });

  it("rejects callers who are not platform admins before touching anything", async () => {
    h.requirePlatformAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(createClientAction(form())).rejects.toThrow("NEXT_REDIRECT");
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.createOrganization).not.toHaveBeenCalled();
  });
});
