import { afterEach, describe, expect, it, vi } from "vitest";
import { chipsFrom, withoutKey, type Facet } from "../src/components/page/filters";
import { rowNumber } from "../src/components/page/row-number";
import { viewPref } from "../src/components/page/view-pref";

const statusFacet: Facet = {
  key: "status",
  label: "Status",
  options: [
    { value: "failed", label: "Failed" },
    { value: "sent", label: "Sent" },
  ],
};

describe("list kit", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds chips only for set facets", () => {
    expect(chipsFrom({ status: "failed", q: "x" }, [statusFacet])).toEqual([{ key: "status", label: "Status", valueLabel: "Failed" }]);
    expect(chipsFrom({}, [statusFacet])).toEqual([]);
  });

  it("drops key, cursor and offset", () => {
    expect(withoutKey({ status: "failed", cursor: "c", offset: 50, appId: "a" }, "status")).toEqual({ appId: "a" });
  });

  it("numbers rows from the offset", () => {
    expect(rowNumber(undefined, 0)).toBe(1);
    expect(rowNumber(50, 0)).toBe(51);
    expect(rowNumber(50, 1)).toBe(52);
  });

  it("falls back to list for unknown stored values", () => {
    const store: Record<string, string> = { "relay-view:/apps": "bogus", "relay-view:/lists": "grid" };
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) });
    expect(viewPref.read("/apps")).toBe("list");
    expect(viewPref.read("/lists")).toBe("grid");
    expect(viewPref.read("/none")).toBe("list");
    viewPref.write("/none", "grid");
    expect(viewPref.read("/none")).toBe("grid");
  });
});
