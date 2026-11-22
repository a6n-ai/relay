import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ pathname: "" }));

vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));

const { ViewTitle } = await import("./view-title");

describe("ViewTitle crumbs", () => {
  it("renders a crumb without an href as plain text, not a link", () => {
    h.pathname = "/dashboard/settings/apps/tnt_b/domain";
    const html = renderToStaticMarkup(createElement(ViewTitle, { title: "Domain" }));
    expect(html).not.toContain('href="#"');
    expect(html).toContain('<span class="shrink-0 text-muted-foreground max-sm:hidden">Apps</span>');
    expect(html).toContain('href="/dashboard/settings/general"');
  });
});
