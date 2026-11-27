import { describe, expect, it } from "vitest";
import { isEmailAddress } from "./email-address";

const OLD = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe("isEmailAddress", () => {
  it("agrees with the old regex", () => {
    for (const s of ["a@b.c", "a@b..c", "a@.b.c", "a@b.c.", "a@b.", "a@.c", "a@bc", "@b.c", "a@@b.c", "a b@c.d", "a@b\t.c", "a.b@c.d.e", "ü@ö.de", "a@b.c@d.e", ""])
      expect(isEmailAddress(s), s).toBe(OLD.test(s));
  });
  it("stays linear on a hostile domain", () => {
    const evil = "a@" + ".".repeat(100_000) + "!";
    const t = performance.now();
    expect(isEmailAddress(evil)).toBe(OLD.test("a@..!"));
    expect(performance.now() - t).toBeLessThan(200);
  });
});
