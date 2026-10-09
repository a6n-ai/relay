import { describe, expect, it } from "vitest";
import { interpolate } from "./interpolate";

describe("interpolate", () => {
  it("replaces nested dotted vars", () => {
    expect(interpolate("Order {{order.code}}", { order: { code: "TG-1" } })).toBe("Order TG-1");
  });
  it("renders missing vars as empty string", () => {
    expect(interpolate("X{{order.nope}}Y", { order: {} })).toBe("XY");
  });
  it("stringifies non-string values", () => {
    expect(interpolate("{{p.amount}}", { p: { amount: 12.5 } })).toBe("12.5");
  });
  it("tolerates whitespace in braces", () => {
    expect(interpolate("{{ order.code }}", { order: { code: "A" } })).toBe("A");
  });

  describe("|fallback", () => {
    it("keeps the old behaviour for plain tokens", () => {
      expect(interpolate("Hi {{contact.name}}!", { contact: { name: "Asha" } })).toBe("Hi Asha!");
      expect(interpolate("Hi {{contact.name}}!", {})).toBe("Hi !");
    });

    it("uses the fallback when the value is missing", () => {
      expect(interpolate("Hi {{contact.name|there}},", {})).toBe("Hi there,");
    });

    it("uses the fallback when the value is blank", () => {
      expect(interpolate("Hi {{contact.name|there}},", { contact: { name: "  " } })).toBe("Hi there,");
    });

    it("prefers the real value over the fallback", () => {
      expect(interpolate("Hi {{ contact.name | there }},", { contact: { name: "Asha" } })).toBe("Hi Asha,");
    });

    it("allows an empty fallback", () => {
      expect(interpolate("Hi {{contact.name|}}!", {})).toBe("Hi !");
    });

    it("keeps spaces inside the fallback", () => {
      expect(interpolate("{{contact.name|dear friend}}", {})).toBe("dear friend");
    });
  });
});
