import { describe, expect, it } from "vitest";
import { REALM_SLUGS, parseCreateTenantForm } from "./forms";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("parseCreateTenantForm", () => {
  it("requires name and slug", () => {
    expect(parseCreateTenantForm(form({ name: "  ", slug: "x" }))).toEqual({
      error: "Name and slug are required",
    });
    expect(parseCreateTenantForm(form({ name: "Tiffin", slug: "" }))).toEqual({
      error: "Name and slug are required",
    });
  });

  it("defaults mailing country to CA and uppercases an explicit ISO", () => {
    expect(parseCreateTenantForm(form({ name: "Tiffin Grab", slug: "tiffin-grab" }))).toEqual({
      value: {
        name: "Tiffin Grab",
        slug: "tiffin-grab",
        mailingCountry: "CA",
        physicalAddress: null,
      },
    });
    expect(
      parseCreateTenantForm(form({ name: "US Co", slug: "us-co", mailingCountry: "us", physicalAddress: "1 Main" })),
    ).toMatchObject({ value: { mailingCountry: "US", physicalAddress: "1 Main" } });
  });
});

describe("REALM_SLUGS", () => {
  it("provisions the two Realm client apps in Canada", () => {
    expect(REALM_SLUGS.map((s) => s.slug)).toEqual(["tiffin-grab", "puchkaman"]);
    expect(REALM_SLUGS.every((s) => s.mailingCountry === "CA")).toBe(true);
  });
});
