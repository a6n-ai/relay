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
