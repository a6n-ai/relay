import { describe, expect, it } from "vitest";
import { NAV_GROUPS, SECTION_TABS, activeNavHref } from "./nav";

const items = NAV_GROUPS.flatMap((g) => g.items);

describe("sidebar", () => {
  it("has at most 8 links", () => {
    expect(items.length).toBeLessThanOrEqual(8);
  });

  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/mailbox/abc", "/dashboard/mailbox"],
    ["/dashboard/templates", "/dashboard/campaigns"],
    ["/dashboard/automations", "/dashboard/campaigns"],
    ["/dashboard/campaigns/cmp_1", "/dashboard/campaigns"],
    ["/dashboard/webhooks", "/dashboard/logs"],
    ["/dashboard/channels/sms", "/dashboard/channels/email"],
    ["/dashboard/settings/tags", "/dashboard/settings/email"],
    ["/dashboard/settings/mailboxes", "/dashboard/settings/email"],
    ["/dashboard/accounts", "/dashboard/settings/email"],
    ["/dashboard/tenants/tnt_1", "/dashboard/tenants"],
  ])("%s highlights %s", (path, href) => {
    expect(activeNavHref(path)).toBe(href);
  });

  it("every tab page belongs to exactly one sidebar link", () => {
    for (const tabs of Object.values(SECTION_TABS)) {
      for (const t of tabs) expect(items.filter((i) => activeNavHref(t.href) === i.href)).toHaveLength(1);
    }
  });
});
