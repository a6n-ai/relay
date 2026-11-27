import { describe, expect, it } from "vitest";
import { workspaceProfile } from "../src/db/core/schema";
import { codeOf, ERRORS, fail, RelayError } from "../src/shared/errors";
import { DEFAULT_MONTHLY_QUOTA } from "../src/shared/limits";

const sources = import.meta.glob("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const USES = [/new RelayError\(\s*"([^"]+)"/g, /\bfail\(\s*"([^"]+)"/g, /codeOf\([^)]*\)\s*===\s*"([^"]+)"/g];

describe("error table", () => {
  it("has a row for every code the source throws or matches", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    const unknown: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const re of USES) for (const m of text.matchAll(re)) if (!Object.hasOwn(ERRORS, m[1])) unknown.push(`${file}: ${m[1]}`);
    }
    expect(unknown).toEqual([]);
  });

  it("uses the code as the message and the row's status", () => {
    expect(() => fail("not found")).toThrow("not found");
    const err = new RelayError("quota_exceeded");
    expect([err.message, err.status, err.code]).toEqual(["quota_exceeded", 429, "quota_exceeded"]);
    expect(new RelayError("not found", 400).status).toBe(400);
    expect(new RelayError("invalid input", 400, "detail").message).toBe("detail");
  });

  it("finds a code by message and ignores anything else", () => {
    expect(codeOf(new Error("forbidden"))).toBe("forbidden");
    expect(codeOf(new Error("constructor"))).toBeUndefined();
    expect(codeOf("forbidden")).toBeUndefined();
  });
});

describe("limits", () => {
  it("keeps the default quota equal to the column default", () => {
    expect(workspaceProfile.monthlyMessageQuota.default).toBe(DEFAULT_MONTHLY_QUOTA);
  });
});
