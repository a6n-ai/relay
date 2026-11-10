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
    expect(viewCrumbs("/dashboard/settings/tags", "Tags")).toEqual([
      { label: "Settings", href: "/dashboard/settings/email" },
      { label: "Tags" },
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

  it("falls back to the title for pages outside the sidebar", () => {
    expect(viewCrumbs("/dashboard/account", "Your account")).toEqual([{ label: "Your account" }]);
  });
});
