import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { confirmReady, typedHint, typedMatches } from "../src/components/confirm-dialog";
import { SettingsCard } from "../src/components/page/settings-card";
import { EmptyChoice } from "../src/components/form/empty-choice";
import { withoutKey } from "../src/components/form/field";
import { TextField } from "../src/components/form/text-field";
import { DangerCard } from "../src/components/page/danger-card";
import { FormActions } from "../src/components/page/form-parts";
import { choiceMode } from "../src/components/form/choice-mode";
import { addressDomains, defaultDomain, normaliseLocal, splitEmail } from "../src/components/form/domain-email";
import { slugify, splitSlugError } from "../src/components/form/slugify";

const dialog = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("../src/components/confirm-dialog", async (orig) => ({
  ...(await orig<typeof import("../src/components/confirm-dialog")>()),
  ConfirmDialog: (props: Record<string, unknown>) => {
    dialog.props = props;
    return null;
  },
}));

describe("choiceMode", () => {
  it("picks the control by count and options", () => {
    expect(choiceMode(3)).toBe("segmented");
    expect(choiceMode(3, { describe: true })).toBe("cards");
    expect(choiceMode(5)).toBe("select");
    expect(choiceMode(13)).toBe("combobox");
    expect(choiceMode(2, { people: true })).toBe("combobox");
  });
  it("falls back to cards when the segments cannot fit a dialog", () => {
    expect(choiceMode(3, { labels: ["Member", "Admin", "Owner"] })).toBe("segmented");
    expect(choiceMode(4, { labels: ["All streams", "Transactional", "Tracked", "Marketing"] })).toBe("cards");
    expect(choiceMode(2, { labels: ["mail.relaycheck.test", "pending.relaycheck.test Pending"] })).toBe("cards");
  });
});

describe("splitEmail", () => {
  it("splits a pasted address when the domain is known", () => {
    expect(splitEmail("Hello@Acme.com", ["acme.com"])).toEqual({ local: "hello", domain: "acme.com" });
  });
  it("keeps only the local part for an unknown domain", () => {
    expect(splitEmail("hello@other.com", ["acme.com"])).toEqual({ local: "hello" });
  });
  it("handles a bare local part", () => {
    expect(splitEmail("sales", ["acme.com"])).toEqual({ local: "sales" });
  });
  it("normaliseLocal lowercases, trims and drops from @", () => {
    expect(normaliseLocal("  Sales@x.com ")).toBe("sales");
  });
});

describe("addressDomains", () => {
  const domains = [
    { domain: "a.com", status: "verified" },
    { domain: "b.com", status: "pending" },
  ];
  it("disables pending domains for inboxes", () => {
    expect(addressDomains(domains, "inbox")).toEqual([
      { domain: "a.com", pending: false, disabled: false },
      { domain: "b.com", pending: true, disabled: true },
    ]);
    expect(addressDomains(domains, "both")[1]?.disabled).toBe(true);
  });
  it("allows pending domains for senders", () => {
    expect(addressDomains(domains, "sender")[1]).toEqual({ domain: "b.com", pending: true, disabled: false });
  });
});

describe("defaultDomain", () => {
  it("picks the first enabled domain, or none", () => {
    expect(defaultDomain([{ domain: "b.com", disabled: true }, { domain: "a.com", disabled: false }])).toBe("a.com");
    expect(defaultDomain([{ domain: "b.com", disabled: true }])).toBe("");
  });
});

describe("slugify", () => {
  const re = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
  it("slugs names", () => {
    expect(slugify("Acme Mail!")).toBe("acme-mail");
    expect(slugify("  --x--  ")).toBe("x");
  });
  it("returns empty for no usable characters", () => {
    expect(slugify("!!!")).toBe("");
  });
  it("caps at 40 with no trailing dash", () => {
    const s = slugify("word ".repeat(12));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
    expect(s).toMatch(re);
  });
});

describe("splitSlugError", () => {
  it("routes slug errors to the slug field only", () => {
    expect(splitSlugError("That slug is already used in this workspace.")).toEqual({ slug: "That slug is already used in this workspace.", rest: null });
    expect(splitSlugError("Could not create the app.")).toEqual({ slug: null, rest: "Could not create the app." });
    expect(splitSlugError(null)).toEqual({ slug: null, rest: null });
  });
});

// Function components without hooks can be called, which gives their element tree to walk.
function find(node: ReactNode, test: (props: Record<string, any>) => boolean): Record<string, any> | undefined {
  if (!isValidElement(node)) return Array.isArray(node) ? node.map((n) => find(n, test)).find(Boolean) : undefined;
  const props = node.props as Record<string, any>;
  return test(props) ? props : find(props.children, test);
}

describe("TextField", () => {
  it("puts the error on the field and wires aria", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "n", label: "Name", hint: "Shown in lists.", error: "Enter a name.", value: "", onChange: () => {} }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="n-error n-hint"');
    expect(html).toContain('id="n-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('for="n"');
  });
  it("has no aria-invalid without an error", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "n", label: "Name", value: "", onChange: () => {} }));
    expect(html).not.toContain(" aria-invalid=");
    expect(html).not.toContain(" aria-describedby=");
  });
  it("renders a prefix or suffix inside the field", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "u", label: "URL", prefix: "https://", suffix: "/hook", value: "", onChange: () => {} }));
    expect(html.indexOf("https://")).toBeLessThan(html.indexOf("<input"));
    expect(html.indexOf("/hook")).toBeGreaterThan(html.indexOf("<input"));
  });
  it("asks the form to clear the error on change, not before", () => {
    const clear = vi.fn();
    const change = vi.fn();
    const withError = TextField({ id: "n", label: "Name", error: "Enter a name.", onClearError: clear, onChange: change });
    find(withError, (p) => typeof p.onChange === "function")?.onChange({ target: { value: "a" } });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);
    const clean = vi.fn();
    const noError = TextField({ id: "n", label: "Name", onClearError: clean, onChange: change });
    find(noError, (p) => typeof p.onChange === "function")?.onChange({ target: { value: "a" } });
    expect(clean).not.toHaveBeenCalled();
  });
  it("withoutKey drops only that field's error", () => {
    expect(withoutKey<"a" | "b">({ a: "x", b: "y" }, "a")).toEqual({ b: "y" });
    const same: Partial<Record<"a" | "b", string>> = { b: "y" };
    expect(withoutKey(same, "a")).toBe(same);
  });
});

describe("FormActions disabledReason", () => {
  const html = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(FormActions, { submitLabel: "Create app", ...props }));
  it("shows the reason as a muted line and ties it to the disabled primary", () => {
    const out = html({ disabled: true, disabledReason: "Enter a name first." });
    expect(out).toContain("Enter a name first.");
    expect(out).toContain("text-muted-foreground");
    expect(out).toMatch(/<button[^>]*disabled[^>]*aria-describedby=/);
  });
  it("shows nothing when enabled, pending or no reason is given", () => {
    expect(html({ disabledReason: "Enter a name first." })).not.toContain("Enter a name first.");
    expect(html({ disabled: true, pending: true, disabledReason: "Enter a name first." })).not.toContain("Enter a name first.");
    expect(html({ disabled: true })).not.toContain("text-muted-foreground");
  });
  it("is a tab stop only while a reason shows, and adds no group name", () => {
    const withReason = html({ disabled: true, disabledReason: "Enter a name first." });
    const without = html({});
    expect(withReason).not.toContain('role="group"');
    expect(withReason).toContain('tabindex="0"');
    expect(without).not.toContain("tabindex");
  });
});

describe("DangerCard typed confirm", () => {
  it("matches the exact text only, case-sensitive", () => {
    expect(typedMatches("acme", "acme")).toBe(true);
    expect(typedMatches("acme", "Acme")).toBe(false);
    expect(typedMatches("acme", "acme ")).toBe(false);
    expect(typedMatches("acme", "")).toBe(false);
    expect(typedMatches(undefined, "")).toBe(true);
  });
  it("holds the confirm until the exact text is typed or the preview is satisfied", () => {
    expect(confirmReady("acme", "acme")).toBe(true);
    expect(confirmReady("acme", "Acme")).toBe(false);
    expect(confirmReady("acme", "acme", true)).toBe(false);
    expect(confirmReady(undefined, "", false)).toBe(true);
  });
  it("reminds about capitals only once the text is as long as the answer", () => {
    expect(typedHint("acme", "ac")).toBeUndefined();
    expect(typedHint("acme", "acme")).toBeUndefined();
    expect(typedHint("acme", "ACME")).toContain("capitals");
  });
  it("states the consequence once, on the card; the dialog gets the name only", () => {
    dialog.props = null;
    const html = renderToStaticMarkup(
      createElement(DangerCard, {
        title: "Delete workspace",
        description: "Deletes the workspace and its members.",
        buttonLabel: "Delete workspace",
        confirmTitle: "Delete this workspace?",
        typed: "acme",
        onConfirm: async () => {},
      }),
    );
    expect(html.match(/Deletes the workspace and its members\./g)).toHaveLength(1);
    expect(dialog.props).toMatchObject({ typed: "acme", title: "Delete this workspace?", confirmLabel: "Delete workspace" });
    expect(dialog.props).not.toHaveProperty("description");
  });
});

describe("SettingsCard footer", () => {
  const html = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(SettingsCard, { title: "Name", action: createElement("button"), ...props }));
  it("keeps the hint, and adds the reason after it while the action is disabled", () => {
    expect(html({ footer: "Up to 80 characters." })).not.toContain("Change the name");
    const out = html({ footer: "Up to 80 characters.", disabledReason: "Change the name to save it." });
    expect(out).toContain("Up to 80 characters.");
    expect(out).toContain("Change the name to save it.");
  });
});

describe("EmptyChoice", () => {
  it("says there is nothing yet and links to where one is made", () => {
    const tree = EmptyChoice({ id: "list", label: "List", message: "No lists yet.", to: "/lists/new", search: { appId: "app_1" }, linkLabel: "Create a list" });
    const link = find(tree, (p) => p.to === "/lists/new");
    expect(link?.search).toEqual({ appId: "app_1" });
    expect(link?.children).toBe("Create a list");
    expect(find(tree, (p) => Array.isArray(p.children) && p.children[0] === "No lists yet.")).toBeTruthy();
  });
  it("shows an error when the pick is empty, and labels the group", () => {
    const tree = EmptyChoice({ id: "list", label: "List", message: "No lists yet.", to: "/lists/new", linkLabel: "Create a list", error: "Choose a list." });
    expect(find(tree, (p) => p.error === "Choose a list.")).toBeTruthy();
    const group = find(tree, (p) => p.role === "group");
    expect(group?.["aria-labelledby"]).toBe("list-label");
    expect(group?.["aria-describedby"]).toBe("list-error");
    expect(find(tree, (p) => p.htmlFor === null)).toBeTruthy();
  });
});
