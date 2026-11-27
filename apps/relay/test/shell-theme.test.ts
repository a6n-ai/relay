import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_KEY, themeBootScript } from "../src/components/shell/theme";

describe("resolveTheme", () => {
  it("follows the system when pref is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the system for an explicit pref", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("themeBootScript", () => {
  it("reads the stored key and defaults to dark", () => {
    expect(themeBootScript).toContain(THEME_KEY);
    expect(themeBootScript).toContain('"dark"');
  });
});

describe("themeBootScript unknown values", () => {
  const run = (stored: string | null) => {
    const classList = { toggle: (_: string, on: boolean) => (dark = on), add: () => (dark = true) };
    let dark: boolean | null = null;
    new Function("localStorage", "matchMedia", "document", themeBootScript)(
      { getItem: () => stored },
      () => ({ matches: false }),
      { documentElement: { classList } },
    );
    return dark;
  };

  it("treats missing and unknown values as dark", () => {
    expect(run(null)).toBe(true);
    expect(run("bogus")).toBe(true);
    expect(run("light")).toBe(false);
  });
});
