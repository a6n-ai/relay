import { describe, expect, it } from "vitest";
import { scopedLoad } from "../src/components/lib/scoped-load";
import type { Shell } from "../src/shared/views";
import type { OrgRole } from "../src/shared/roles";

const shell = (roles: OrgRole[], apps: Shell["apps"] = []): Shell => ({
  user: { id: "u", email: "u@x.test", name: "U" },
  platformAdmin: false,
  active: { id: "w", name: "W", slug: "w", status: "active", roles },
  workspaces: [],
  apps,
});
const none = { rows: [] as string[] };

describe("scopedLoad", () => {
  it("is denied without tenant:read, even when the workspace has no app", async () => {
    await expect(scopedLoad(undefined, shell([]), async () => ({ rows: ["x"] }), none)).resolves.toBeNull();
  });

  it("shows the empty state to a reader of a workspace with no app", async () => {
    await expect(scopedLoad(undefined, shell(["member"]), async () => ({ rows: ["x"] }), none)).resolves.toEqual({ apps: [], appId: undefined, rows: [] });
  });

  it("loads the default app for a reader", async () => {
    const apps = [{ id: "app_1", name: "One" }];
    await expect(scopedLoad(undefined, shell(["member"], apps), async (id) => ({ rows: [id] }), none)).resolves.toEqual({ apps, appId: "app_1", rows: ["app_1"] });
  });

  it("is denied without an active workspace", async () => {
    await expect(scopedLoad(undefined, { ...shell(["owner"]), active: null }, async () => ({ rows: [] }), none)).resolves.toBeNull();
  });
});
