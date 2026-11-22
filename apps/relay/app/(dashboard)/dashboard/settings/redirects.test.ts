import { describe, expect, it, vi } from "vitest";
import AccountRedirect from "../account/page";
import AccountsRedirect from "../accounts/page";
import TeamsRedirect from "../accounts/teams/page";
import RolesRedirect from "../accounts/roles/page";

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
  ])("%s redirects to %s", (_name, Page, target) => {
    expect(() => Page()).toThrow(`REDIRECT ${target}`);
  });
});
