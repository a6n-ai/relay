import { describe, expect, it } from "vitest";
import { parseCreateTenantForm } from "./forms";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("parseCreateTenantForm", () => {
  it("parses quota and defaults mailing country", () => {
    const parsed = parseCreateTenantForm(form({ name: "Realm", slug: "realm-dev", monthlyMessageQuota: "25000" }));
    expect(parsed).toEqual({
      value: {
        name: "Realm",
        slug: "realm-dev",
        mailingCountry: "CA",
        physicalAddress: null,
        monthlyMessageQuota: 25000,
      },
    });
  });
});
