import { describe, expect, it } from "vitest";
import { opsParamsSchema } from "../src/core/ops-params";

describe("relay-ops params", () => {
  it("accepts a seed with owners, workspace and app, and a bare sweep", () => {
    expect(
      opsParamsSchema.safeParse({
        op: "seed",
        input: { ownerEmails: ["Owner@Example.com"], workspace: { name: "a6n", slug: "a6n" }, app: { name: "a6n", slug: "a6n" } },
      }).success,
    ).toBe(true);
    expect(opsParamsSchema.safeParse({ op: "sweep" }).success).toBe(true);
  });

  it("refuses an unknown op and a seed without owners", () => {
    expect(opsParamsSchema.safeParse({ op: "drop" }).success).toBe(false);
    expect(
      opsParamsSchema.safeParse({ op: "seed", input: { ownerEmails: [], workspace: { name: "a", slug: "a" }, app: { name: "a", slug: "a" } } })
        .success,
    ).toBe(false);
  });
});
