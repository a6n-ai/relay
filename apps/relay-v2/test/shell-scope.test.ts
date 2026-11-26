import { describe, expect, it } from "vitest";
import { effectiveApp, isAppScoped, navSearch, scopeLabel, scopeSearch, showsAllApps, withNew } from "../src/components/shell/scope";

const apps = [{ id: "a", name: "Shop" }];

describe("scopeLabel", () => {
  it("names the app", () => expect(scopeLabel(apps, "a")).toBe("Shop"));
  it("falls back to All apps for an unknown id", () => expect(scopeLabel(apps, "zzz")).toBe("All apps"));
  it("falls back to All apps when unset", () => expect(scopeLabel(apps, undefined)).toBe("All apps"));
});

describe("isAppScoped", () => {
  it.each(["/messages", "/campaigns", "/campaigns/templates", "/campaigns/automations", "/lists", "/lists/"])("matches %s", (p) =>
    expect(isAppScoped(p)).toBe(true),
  );
  it.each(["/", "/apps/a1", "/messagesx", "/messages/failures", "/messages/suppressions", "/messages/m1", "/lists/l1", "/campaigns/c1", "/campaigns/templates/t1"])(
    "rejects %s",
    (p) => expect(isAppScoped(p)).toBe(false),
  );
});

describe("effectiveApp", () => {
  const two = [{ id: "a" }, { id: "b" }];
  it("keeps a known app", () => expect(effectiveApp(two, "b", "/campaigns")).toBe("b"));
  it("is all apps on Messages and Lists", () => {
    expect(showsAllApps("/lists")).toBe(true);
    expect(effectiveApp(two, undefined, "/messages")).toBeUndefined();
  });
  it("falls back to the first app on Campaigns, Templates and Automations", () => {
    for (const p of ["/campaigns", "/campaigns/templates", "/campaigns/automations"]) expect(effectiveApp(two, undefined, p)).toBe("a");
  });
  it("falls back when the id is unknown", () => expect(effectiveApp(two, "zzz", "/campaigns")).toBe("a"));
  it("has no app when there are none", () => expect(effectiveApp([], undefined, "/campaigns")).toBeUndefined());
});

describe("navSearch", () => {
  it("adds appId to scoped targets and keeps their search", () => {
    expect(navSearch("/messages", { dir: "in" }, "a")).toEqual({ dir: "in", appId: "a" });
    expect(navSearch("/campaigns/templates", undefined, "a")).toEqual({ appId: "a" });
  });
  it("leaves other targets and unset scope alone", () => {
    expect(navSearch("/messages/suppressions", undefined, "a")).toBeUndefined();
    expect(navSearch("/lists", undefined, undefined)).toBeUndefined();
  });
});

describe("withNew", () => {
  it("keeps appId and nothing else", () => expect(withNew({ appId: "a", cursor: "c", q: "x" })).toEqual({ appId: "a" }));
  it("adds nothing without an app", () => expect(withNew({ cursor: "c" })).toEqual({}));
  it("adds new only for a dialog kind", () => expect(withNew({ appId: "a" }, 1)).toEqual({ appId: "a", new: 1 }));
});

describe("scopeSearch", () => {
  it("sets appId, keeps other params, drops cursor", () => {
    expect(scopeSearch({ q: "x", cursor: "c", appId: "old" }, "a")).toEqual({ q: "x", appId: "a" });
    expect(scopeSearch({ cursor: "c", offset: 50 }, "a")).toEqual({ appId: "a" });
  });
  it("removes appId for All apps", () => {
    expect(scopeSearch({ q: "x", appId: "old" }, undefined)).toEqual({ q: "x" });
  });
});
