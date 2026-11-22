import { describe, expect, it, vi } from "vitest";
import AccountRedirect from "../account/page";
import AccountsRedirect from "../accounts/page";
import TeamsRedirect from "../accounts/teams/page";
import RolesRedirect from "../accounts/roles/page";
import AppRedirect from "../tenants/[id]/page";
import ClientsRedirect from "../platform/page";
import ClientRedirect from "../platform/[id]/page";

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

describe("old account and team pages redirect into Settings", () => {
  it.each([
    ["account", AccountRedirect, "/dashboard/settings/account"],
    ["accounts", AccountsRedirect, "/dashboard/settings/members"],
    ["accounts/teams", TeamsRedirect, "/dashboard/settings/teams"],
    ["accounts/roles", RolesRedirect, "/dashboard/settings/roles"],
    ["platform", ClientsRedirect, "/dashboard/settings/clients"],
  ])("%s redirects to %s", (_name, Page, target) => {
    expect(() => Page()).toThrow(`REDIRECT ${target}`);
  });
});

describe("old app page redirects into app settings", () => {
  it("tenants/[id] redirects to settings/apps/[id]", async () => {
    await expect(AppRedirect({ params: Promise.resolve({ id: "ctn_1" }) })).rejects.toThrow(
      "REDIRECT /dashboard/settings/apps/ctn_1",
    );
  });
});

describe("old client page redirects into Settings", () => {
  it("platform/[id] redirects to settings/clients/[id]", async () => {
    await expect(ClientRedirect({ params: Promise.resolve({ id: "org_1" }) })).rejects.toThrow(
      "REDIRECT /dashboard/settings/clients/org_1",
    );
  });
});
