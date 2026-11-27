import { describe, expect, it } from "vitest";
import { allows } from "../src/shared/permissions";
import { pageOf } from "./shell-pages";
import { activeNav, createItems, sectionTabs, visibleNav } from "../src/components/shell/nav";

const ids = (groups: ReturnType<typeof visibleNav>) => groups.map((g) => g.id);

describe("visibleNav", () => {
  it("shows a platform admin with no workspace only Admin", () => {
    expect(visibleNav([], true, false, pageOf).flatMap((g) => g.items.map((i) => i.id))).toEqual(["admin"]);
  });

  it("hides the platform group from a member", () => {
    expect(ids(visibleNav(["member"], false, true, pageOf))).not.toContain("platform");
  });

  it("shows only the platform group and unrestricted items to a platform admin with no roles", () => {
    const groups = visibleNav([], true, true, pageOf);
    expect(ids(groups)).toEqual(["work", "setup", "platform"]);
    const work = groups.find((g) => g.id === "work");
    const setup = groups.find((g) => g.id === "setup");
    expect(work?.items.map((i) => i.id)).toEqual(["overview"]);
    expect(setup?.items.map((i) => i.id)).toEqual(["apps", "settings"]);
    expect(setup?.items.find((i) => i.id === "settings")?.children?.map((c) => c.id)).toEqual([
      "general",
      "members",
      "invites",
      "teams",
    ]);
    expect(groups.find((g) => g.id === "platform")?.items.map((i) => i.id)).toEqual(["admin"]);
  });
});

describe("activeNav", () => {
  it.each([
    ["/campaigns/templates/abc", {}, { item: "campaigns", child: "templates" }],
    ["/campaigns/c1", {}, { item: "campaigns", child: "campaigns" }],
    ["/messages", { dir: "in" }, { item: "messages", child: "received" }],
    ["/messages", {}, { item: "messages", child: "sent" }],
    ["/messages/m1", {}, { item: "messages", child: "sent" }],
    ["/", {}, { item: "overview" }],
    ["/settings/teams", {}, { item: "settings", child: "teams" }],
    ["/apps/a1/webhooks", {}, { item: "apps" }],
  ])("resolves %s", (pathname, search, expected) => {
    expect(activeNav(pathname, search)).toEqual(expected);
  });

  it("returns null for a path outside the nav", () => {
    expect(activeNav("/nowhere", {})).toBeNull();
  });
});

describe("createItems", () => {
  it("is empty when the workspace is suspended", () => {
    expect(createItems(["owner"], true)).toEqual([]);
  });

  it("returns only the create actions a member may use", () => {
    const items = createItems(["member"], false);
    const expected = createItems(["owner"], false).filter((i) => allows(["member"], i.need));
    expect(items.map((i) => i.id)).toEqual(expected.map((i) => i.id));
    expect(items.every((i) => allows(["member"], i.need))).toBe(true);
    expect(items.map((i) => i.id)).not.toContain("app");
  });
});

describe("sectionTabs", () => {
  it("lists Messages tabs and follows the dir search", () => {
    expect(sectionTabs(["owner"], "/messages", { dir: "in" }, pageOf)).toMatchObject({ title: "Messages", active: "received" });
    expect(sectionTabs(["owner"], "/messages", {}, pageOf)?.tabs.map((t) => t.label)).toEqual(["Sent", "Received", "Failed", "Suppressed"]);
  });

  it("has no tabs on a detail page or a page without sections", () => {
    expect(sectionTabs(["owner"], "/messages/abc", {}, pageOf)).toBeNull();
    expect(sectionTabs(["owner"], "/domains", {}, pageOf)).toBeNull();
  });

  it("gives an app its Overview and Webhooks tabs", () => {
    expect(sectionTabs(["owner"], "/apps/a1/webhooks", {}, pageOf)).toMatchObject({ title: null, active: "webhooks" });
  });
});
