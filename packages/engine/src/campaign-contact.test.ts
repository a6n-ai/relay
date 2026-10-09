import { describe, expect, it } from "vitest";
import { contactVars } from "./campaign";

describe("contactVars", () => {
  it("splits the name into first and last", () => {
    expect(contactVars({ name: "Priya Anand Sharma", email: "p@x.ca" })).toEqual({
      name: "Priya Anand Sharma",
      first_name: "Priya",
      last_name: "Anand Sharma",
      email: "p@x.ca",
    });
  });
  it("leaves blanks for a missing name so |fallback applies", () => {
    expect(contactVars({ name: null, email: null })).toEqual({ name: "", first_name: "", last_name: "", email: "" });
  });
  it("lets list-import vars override", () => {
    expect(contactVars({ name: "A B", email: "a@x", vars: { first_name: "Ann" } }).first_name).toBe("Ann");
  });
});
