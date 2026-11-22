import { describe, expect, it } from "vitest";
import { permKey, type Perm } from "./nav";
import { APPS_PERM, visibleSettingsNav } from "./settings-nav";

const SETTINGS_READ: Perm = { settings: ["read"] };
const STAFF_READ: Perm = { staff: ["read"] };
const APPS = [
  { publicId: "tnt_a", name: "Alpha" },
  { publicId: "tnt_b", name: "Beta" },
];

const granted = (...perms: Perm[]) => new Set(perms.map(permKey));
const labels = (nav: ReturnType<typeof visibleSettingsNav>) => nav.flatMap((g) => g.items.map((i) => i.label));
const activeLabels = (nav: ReturnType<typeof visibleSettingsNav>) =>
  nav.flatMap((g) => [...g.items, ...g.items.flatMap((i) => i.children ?? [])]).filter((i) => i.active).map((i) => i.label);

describe("visibleSettingsNav", () => {
  it("shows Organization → Clients only to platform staff, below Apps", () => {
    const path = "/dashboard/settings/clients/org_1";
    expect(visibleSettingsNav(granted(APPS_PERM), APPS, path).map((g) => g.label)).not.toContain("Organization");
    const nav = visibleSettingsNav(granted(APPS_PERM), APPS, path, true);
    expect(nav.map((g) => g.label).slice(-2)).toEqual(["Apps", "Organization"]);
    expect(activeLabels(nav)).toEqual(["Clients"]);
  });

  it("member sees workspace links they can read", () => {
    const nav = visibleSettingsNav(granted(SETTINGS_READ, STAFF_READ), [], "/dashboard/settings/general");
    expect(labels(nav)).toEqual(
      expect.arrayContaining(["General", "Members", "Teams", "Roles", "Mailboxes", "Email sending", "Tags"]),
    );
    expect(labels(nav)).not.toContain("Mailbox access");
  });

  it("billing role sees only what it can read", () => {
    const nav = visibleSettingsNav(granted(SETTINGS_READ), [], "/dashboard/settings/general");
    expect(labels(nav)).toContain("General");
    expect(labels(nav)).not.toEqual(expect.arrayContaining(["Members", "Teams", "Roles", "Mailbox access"]));
  });

  it("no apps hides the Apps group", () => {
    const nav = visibleSettingsNav(granted(APPS_PERM), [], "/dashboard/settings/general");
    expect(nav.map((g) => g.label)).not.toContain("Apps");
  });

  it("hides the Apps group without tenant:read even when apps exist", () => {
    const nav = visibleSettingsNav(granted(SETTINGS_READ), APPS, "/dashboard/settings/general");
    expect(nav.map((g) => g.label)).not.toContain("Apps");
  });

  it("only the open app expands, and its page is the active link", () => {
    const nav = visibleSettingsNav(granted(APPS_PERM), APPS, "/dashboard/settings/apps/tnt_b/domain");
    const apps = nav.find((g) => g.label === "Apps")!.items;
    const [tntA, tntB] = apps as [(typeof apps)[number], (typeof apps)[number]];
    expect(tntA.open).toBe(false);
    expect(tntA.children).toHaveLength(4);
    expect(tntA.children!.some((c) => c.active)).toBe(false);
    expect(tntB.open).toBe(true);
    expect(tntB.children).toHaveLength(4);
    expect(tntB.children!.filter((c) => c.active).map((c) => c.label)).toEqual(["Domain"]);
    expect(tntB.children!.find((c) => c.label === "General")!.active).toBe(false);
  });

  it("an app's General is active only on its exact path", () => {
    const nav = visibleSettingsNav(granted(APPS_PERM), APPS, "/dashboard/settings/apps/tnt_b");
    expect(activeLabels(nav)).toEqual(["General"]);
  });

  it("Your account always shows", () => {
    const nav = visibleSettingsNav(new Set(), [], "/dashboard/settings/account");
    expect(nav[0]?.label).toBe("Account");
    expect(labels(nav)).toEqual(["Your account"]);
    expect(activeLabels(nav)).toEqual(["Your account"]);
  });

  it("marks only the longest matching link active", () => {
    const nav = visibleSettingsNav(granted(SETTINGS_READ, STAFF_READ, { mailbox: ["manage"] }), [], "/dashboard/settings/mailbox-access");
    expect(activeLabels(nav)).toEqual(["Mailbox access"]);
  });
});
