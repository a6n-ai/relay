import { describe, expect, it } from "vitest";
import { parseContactsCsv } from "../src/core/csv";

describe("parseContactsCsv", () => {
  it("handles quoted fields, doubled quotes, dedupe and invalid rows", () => {
    const csv = 'Email,First_Name\n"a@x.com","Ann ""A"""\nA@X.COM,dup\nnot-an-email,x\n';
    expect(parseContactsCsv(csv)).toEqual({
      rows: [{ email: "a@x.com", firstName: 'Ann "A"' }],
      invalid: 1,
      duplicates: 1,
    });
  });

  it("parses a BOM and CRLF the same as plain LF", () => {
    const plain = parseContactsCsv("email,first_name\na@x.com,Ann\n");
    expect(parseContactsCsv("﻿email,first_name\r\na@x.com,Ann\r\n")).toEqual(plain);
  });

  it("splits name at the first space when no first or last name column is present", () => {
    const { rows } = parseContactsCsv("name,email\nPriya Sharma,p@x.com");
    expect(rows).toEqual([{ email: "p@x.com", firstName: "Priya", lastName: "Sharma" }]);
  });

  it("reads consent_at as epoch ms and treats an unparseable date as absent", () => {
    const { rows } = parseContactsCsv("email,consent_at\na@x.com,2026-01-02T00:00:00Z\nb@x.com,soon");
    expect(rows[0].consentAt).toBe(Date.parse("2026-01-02T00:00:00Z"));
    expect(rows[1].consentAt).toBeUndefined();
  });

  it("throws when there is no email header", () => {
    expect(() => parseContactsCsv("name\nPriya")).toThrow("missing email column");
  });

  it("throws above 10,000 data rows", () => {
    const body = Array.from({ length: 10_001 }, (_, i) => `u${i}@x.com`).join("\n");
    expect(() => parseContactsCsv(`email\n${body}`)).toThrow("too many rows");
  });
});
