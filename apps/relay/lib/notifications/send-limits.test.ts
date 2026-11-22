import { beforeEach, describe, expect, it, vi } from "vitest";
import { organization, tenants } from "@/db/schema";
import { checkSendLimits } from "./send-limits";

const h = vi.hoisted(() => ({
  tenant: null as null | { organizationId: string | null; quota: number },
  workspace: null as null | { quota: number },
  appUsed: 0,
  workspaceUsed: 0,
}));

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === tenants) return h.tenant ? [h.tenant] : [];
          if (table === organization) return h.workspace ? [h.workspace] : [];
          return [];
        },
      }),
    }),
  },
}));
vi.mock("@/lib/tenants/usage", () => ({
  countTenantSendsThisMonth: async () => h.appUsed,
  countOrganizationSendsThisMonth: async () => h.workspaceUsed,
}));

const APP_OVER = "Monthly message quota exceeded";
const WORKSPACE_OVER = "Workspace monthly message quota exceeded";

describe("checkSendLimits", () => {
  beforeEach(() => {
    h.tenant = { organizationId: "org_1", quota: 100 };
    h.workspace = { quota: 100 };
    h.appUsed = 5;
    h.workspaceUsed = 5;
  });

  it("blocks a send when the workspace is over quota", async () => {
    h.workspaceUsed = 100;
    await expect(checkSendLimits(1n)).resolves.toBe(WORKSPACE_OVER);
  });

  it("blocks a send when the app is over quota", async () => {
    h.appUsed = 100;
    await expect(checkSendLimits(1n)).resolves.toBe(APP_OVER);
  });

  it("allows a send under quota", async () => {
    await expect(checkSendLimits(1n)).resolves.toBeNull();
  });

  it("0 means unlimited", async () => {
    h.tenant = { organizationId: "org_1", quota: 0 };
    h.workspace = { quota: 0 };
    h.appUsed = 999;
    h.workspaceUsed = 999;
    await expect(checkSendLimits(1n)).resolves.toBeNull();
  });

  it("operator mail with no app is never limited", async () => {
    h.appUsed = 999;
    await expect(checkSendLimits(null)).resolves.toBeNull();
  });

  it("counts its own allowed sends within one drain", async () => {
    h.tenant = { organizationId: null, quota: 6 };
    const cache = { apps: new Map(), workspaces: new Map() };
    await expect(checkSendLimits(1n, cache)).resolves.toBeNull();
    await expect(checkSendLimits(1n, cache)).resolves.toBe(APP_OVER);
  });
});
