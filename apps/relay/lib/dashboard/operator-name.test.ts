import { describe, expect, it } from "vitest";
import { operatorFirstName } from "./operator-name";

describe("operatorFirstName", () => {
  it("uses the first word of the name", () => {
    expect(operatorFirstName({ name: "Ada Lovelace", email: "ada@x.io" })).toBe("Ada");
  });
  it("falls back to the email local part when the name is empty or the product name", () => {
    expect(operatorFirstName({ name: " ", email: "ops@a6n.ai" })).toBe("ops");
    expect(operatorFirstName({ name: "Relay", email: "ops@a6n.ai" })).toBe("ops");
  });
  it("falls back to there without a user", () => {
    expect(operatorFirstName(null)).toBe("there");
  });
});
