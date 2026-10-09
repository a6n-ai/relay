import { describe, expect, it } from "vitest";
import { lockDownGlobals } from "./lockdown";

describe("lockDownGlobals", () => {
  it("replaces the name on every object up the prototype chain, not just the scope itself", () => {
    const proto = { fetch: () => "real", XMLHttpRequest: class {} };
    const scope = Object.create(proto) as Record<string, unknown>;
    lockDownGlobals(scope, ["fetch", "XMLHttpRequest"]);
    expect(() => (scope.fetch as () => unknown)()).toThrow("not available in email templates");
    expect(() => (Object.getPrototypeOf(scope).fetch as () => unknown).call(scope)).toThrow("not available in email templates");
    expect(() => new (Object.getPrototypeOf(scope).XMLHttpRequest)()).toThrow("not available in email templates");
  });
  it("cannot be undone by reassigning", () => {
    const scope = Object.create({ fetch: () => "real" }) as Record<string, unknown>;
    lockDownGlobals(scope, ["fetch"]);
    try {
      scope.fetch = () => "back";
    } catch {
      // strict-mode assignment to a read-only property throws; either way it must stay blocked
    }
    expect(() => (scope.fetch as () => unknown)()).toThrow("not available in email templates");
  });
});
