import { describe, expect, it } from "vitest";
import { viewCrumbs } from "./view-crumbs";

describe("viewCrumbs", () => {
  it("is just the title on a sidebar page", () => {
    expect(viewCrumbs("/dashboard", "Home")).toEqual([{ label: "Home" }]);
    expect(viewCrumbs("/dashboard/campaigns", "Campaigns")).toEqual([{ label: "Campaigns" }]);
  });

  it("puts the section first on a tab page", () => {
    expect(viewCrumbs("/dashboard/templates", "Templates")).toEqual([
      { label: "Campaigns", href: "/dashboard/campaigns" },
      { label: "Templates" },
    ]);
  });

  it("links every parent on a detail page and ends on the item", () => {
    expect(viewCrumbs("/dashboard/campaigns/cmp_1", "Spring sale")).toEqual([
      { label: "Campaigns", href: "/dashboard/campaigns" },
      { label: "Spring sale" },
    ]);
    expect(viewCrumbs("/dashboard/tenants/tnt_1", "Realm")).toEqual([
      { label: "Apps", href: "/dashboard/tenants" },
      { label: "Realm" },
    ]);
  });

  it("shows Settings › group › page on a workspace settings page", () => {
    expect(viewCrumbs("/dashboard/settings/tags", "Tags")).toEqual([
      { label: "Settings", href: "/dashboard/settings/general" },
      { label: "Workspace" },
      { label: "Tags" },
    ]);
  });

  it("shows Settings › Account › Your account", () => {
    expect(viewCrumbs("/dashboard/settings/account", "Your account")).toEqual([
      { label: "Settings", href: "/dashboard/settings/general" },
      { label: "Account" },
      { label: "Your account" },
    ]);
  });

  it("shows Settings › Apps › page on an app settings page", () => {
    expect(viewCrumbs("/dashboard/settings/apps/tnt_b/domain", "Domain")).toEqual([
      { label: "Settings", href: "/dashboard/settings/general" },
      { label: "Apps" },
      { label: "Domain" },
    ]);
  });
});
