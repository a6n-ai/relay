import { describe, expect, it } from "vitest";
import { allows } from "../src/lib/auth/permissions";
import { activeNav, APP_SCOPED, createItems, visibleNav } from "../src/components/shell/nav";

const ids = (groups: ReturnType<typeof visibleNav>) => groups.map((g) => g.id);

describe("visibleNav", () => {
  it("hides the platform group from a member", () => {
    expect(ids(visibleNav(["member"], false))).not.toContain("platform");
  });

  it("shows only the platform group and unrestricted items to a platform admin with no roles", () => {
    const groups = visibleNav([], true);
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

describe("APP_SCOPED", () => {
  it("lists the app-scoped path prefixes", () => {
    expect([...APP_SCOPED]).toEqual(["/messages", "/campaigns", "/lists"]);
  });
});

describe("createItems", () => {
  it("is empty when the workspace is suspended", () => {
    expect(createItems(["owner"], true)).toEqual([]);
  });

  it("gives an owner every create action in order", () => {
    expect(createItems(["owner"], false).map((i) => i.id)).toEqual([
      "app",
      "campaign",
      "template",
      "automation",
      "list",
      "domain",
      "invite",
    ]);
  });

  it("returns only the create actions a member may use", () => {
    const items = createItems(["member"], false);
    const expected = createItems(["owner"], false).filter((i) => allows(["member"], i.need));
    expect(items.map((i) => i.id)).toEqual(expected.map((i) => i.id));
    expect(items.every((i) => allows(["member"], i.need))).toBe(true);
    expect(items.map((i) => i.id)).not.toContain("app");
  });
});
