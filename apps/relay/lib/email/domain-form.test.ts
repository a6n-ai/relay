import { describe, expect, it } from "vitest";
import { parseAddSendingDomainForm } from "./domain-form";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("parseAddSendingDomainForm", () => {
  it("requires tenant slug and domain", () => {
    expect(parseAddSendingDomainForm(form({ slug: "", domain: "x.com" }))).toEqual({
      error: "Tenant and domain are required",
    });
  });

  it("normalizes the domain (trim, lowercase, strip trailing dot)", () => {
    expect(parseAddSendingDomainForm(form({ slug: "tiffin-grab", domain: " TiffinGrab.CA. " }))).toEqual({
      value: { slug: "tiffin-grab", domain: "tiffingrab.ca" },
    });
  });
});
