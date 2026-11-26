import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyDocs } from "../scripts/lib/docs";

describe("copyDocs", () => {
  it("replaces the destination with the source tree", () => {
    const root = mkdtempSync(join(tmpdir(), "docs-"));
    const src = join(root, "dist");
    const dest = join(root, "public", "docs");
    mkdirSync(join(src, "api"), { recursive: true });
    writeFileSync(join(src, "index.html"), "new");
    writeFileSync(join(src, "api", "index.html"), "api");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "stale.html"), "old");
    copyDocs(src, dest);
    expect(readFileSync(join(dest, "api", "index.html"), "utf8")).toBe("api");
    expect(existsSync(join(dest, "stale.html"))).toBe(false);
  });

  it("refuses a missing build output", () => {
    expect(() => copyDocs(join(tmpdir(), "no-such-docs-dist"), join(tmpdir(), "x"))).toThrow(/missing/);
  });
});
