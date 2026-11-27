import { describe, expect, it } from "vitest";
import { findEntries, pushRecent, readRecent } from "../src/components/shell/find";
import { type OrgRole } from "../src/shared/roles";
import { type Shell } from "../src/shared/views";

const shell = (roles: OrgRole[], over: Partial<Shell> = {}): Shell => ({
  user: { id: "u", email: "u@x.co", name: "U" },
  platformAdmin: false,
  active: { id: "w", name: "W", slug: "w", status: "active", roles },
  workspaces: [{ id: "w", name: "W" }],
  apps: [{ id: "a1", name: "Alpha" }, { id: "a2", name: "Beta" }],
  ...over,
});

describe("findEntries", () => {
  it("member: no Admin, no create items the role lacks, one entry per app", () => {
    const entries = findEntries(shell(["member"]));
    expect(entries.some((e) => e.label === "Admin")).toBe(false);
    expect(entries.some((e) => e.label === "New Domain")).toBe(false);
    expect(entries.filter((e) => e.group === "Apps").map((e) => e.to)).toEqual(["/apps/a1", "/apps/a2"]);
    expect(entries.find((e) => e.label === "Campaigns › Templates")).toMatchObject({ group: "Pages", to: "/campaigns/templates" });
  });

  it("platform admin sees Admin; owner gets create items", () => {
    const entries = findEntries(shell(["owner"], { platformAdmin: true }));
    expect(entries.find((e) => e.label === "Admin")?.to).toBe("/admin");
    expect(entries.find((e) => e.label === "New Domain")).toMatchObject({ group: "Actions", to: "/domains/new", search: undefined });
  });

  it("suspended workspace has no actions", () => {
    const entries = findEntries(shell(["owner"], { active: { id: "w", name: "W", slug: "w", status: "suspended", roles: ["owner"] } }));
    expect(entries.some((e) => e.group === "Actions")).toBe(false);
  });
});

describe("pushRecent", () => {
  it("moves to front and dedupes", () => expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]));
  it("caps at 5", () => {
    let ids: string[] = [];
    for (const id of "abcdef") ids = pushRecent(ids, id);
    expect(ids).toEqual(["f", "e", "d", "c", "b"]);
  });
});

describe("readRecent", () => {
  it("non-array stored values read as empty", () => {
    expect(readRecent({})).toEqual([]);
    expect(readRecent("x")).toEqual([]);
    expect(readRecent(null)).toEqual([]);
  });
  it("keeps only string entries", () => expect(readRecent(["a", 1, "b"])).toEqual(["a", "b"]));
});
