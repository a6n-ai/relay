import { describe, expect, it } from "vitest";
import { ADMIN_DISABLED_PATHS, ORG_DISABLED_PATHS } from "./disabled-paths";

describe("ADMIN_DISABLED_PATHS", () => {
  it("admin endpoints are not reachable over HTTP", () => {
    for (const p of [
      "/admin/impersonate-user",
      "/admin/set-user-password",
      "/admin/list-users",
      "/admin/create-user",
    ]) {
      expect(ADMIN_DISABLED_PATHS).toContain(p);
    }
  });
});

describe("ORG_DISABLED_PATHS", () => {
  it("org mutations are not reachable over HTTP", () => {
    for (const p of [
      "/organization/invite-member",
      "/organization/update-member-role",
      "/organization/remove-member",
      "/organization/add-team-member",
    ]) {
      expect(ORG_DISABLED_PATHS).toContain(p);
    }
  });

  it("set-active and invitation accept/reject stay open", () => {
    for (const p of ["/organization/set-active", "/organization/accept-invitation", "/organization/reject-invitation"]) {
      expect(ORG_DISABLED_PATHS).not.toContain(p);
    }
  });
});
