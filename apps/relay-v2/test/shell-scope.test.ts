import { describe, expect, it } from "vitest";
import { isAppScoped, scopeLabel, scopeSearch } from "../src/components/shell/scope";

const apps = [{ id: "a", name: "Shop" }];

describe("scopeLabel", () => {
  it("names the app", () => expect(scopeLabel(apps, "a")).toBe("Shop"));
  it("falls back to All apps for an unknown id", () => expect(scopeLabel(apps, "zzz")).toBe("All apps"));
  it("falls back to All apps when unset", () => expect(scopeLabel(apps, undefined)).toBe("All apps"));
});

describe("isAppScoped", () => {
  it("matches scoped sections and their sub-pages", () => {
    expect(isAppScoped("/campaigns/templates")).toBe(true);
    expect(isAppScoped("/messages")).toBe(true);
  });
  it("rejects other pages", () => {
    expect(isAppScoped("/apps/a1")).toBe(false);
    expect(isAppScoped("/")).toBe(false);
    expect(isAppScoped("/messagesx")).toBe(false);
  });
});

describe("scopeSearch", () => {
  it("sets appId, keeps other params, drops cursor", () => {
    expect(scopeSearch({ q: "x", cursor: "c", appId: "old" }, "a")).toEqual({ q: "x", appId: "a" });
  });
  it("removes appId for All apps", () => {
    expect(scopeSearch({ q: "x", appId: "old" }, undefined)).toEqual({ q: "x" });
  });
});
