import { describe, expect, it } from "vitest";
import { csvCell, parseContactsCsv } from "../src/core/csv";

describe("parseContactsCsv", () => {
  it("handles quoted fields, doubled quotes, dedupe and invalid rows", () => {
    const csv = 'Email,First_Name\n"a@x.com","Ann ""A"""\nA@X.COM,dup\nnot-an-email,x\n';
    expect(parseContactsCsv(csv)).toEqual({
      rows: [{ email: "a@x.com", firstName: 'Ann "A"' }],
      invalid: 1,
      duplicates: 1,
    });
  });

  it("accepts exactly 10,000 data rows and refuses the 10,001st", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `u${i}@x.com`).join("\n");
    expect(parseContactsCsv(`email\n${rows(10_000)}\n`).rows).toHaveLength(10_000);
    expect(() => parseContactsCsv(`email\n${rows(10_001)}\n`)).toThrow("too many rows");
  });

  it("parses a BOM and CRLF the same as plain LF", () => {
    const plain = parseContactsCsv("email,first_name\na@x.com,Ann\n");
    expect(parseContactsCsv("﻿email,first_name\r\na@x.com,Ann\r\n")).toEqual(plain);
  });

  it("splits name at the first space when no first or last name column is present", () => {
    const { rows } = parseContactsCsv("name,email\nPriya Sharma,p@x.com");
    expect(rows).toEqual([{ email: "p@x.com", firstName: "Priya", lastName: "Sharma" }]);
  });

  it("reads consent_at as epoch ms; an empty cell is absent", () => {
    const { rows } = parseContactsCsv("email,consent_at\na@x.com,2026-01-02T00:00:00Z\nb@x.com,");
    expect(rows[0].consentAt).toBe(Date.parse("2026-01-02T00:00:00Z"));
    expect(rows[1].consentAt).toBeUndefined();
  });

  it("counts a row with an unparseable consent_at as invalid", () => {
    expect(parseContactsCsv("email,consent_at\na@x.com,soon")).toEqual({ rows: [], invalid: 1, duplicates: 0 });
    expect(parseContactsCsv("email,consent_at\na@x.com,1")).toEqual({ rows: [], invalid: 1, duplicates: 0 });
  });

  it("counts a row with a future consent_at as invalid", () => {
    expect(parseContactsCsv("email,consent_at\na@x.com,2999-01-01")).toEqual({ rows: [], invalid: 1, duplicates: 0 });
  });

  it("counts a row with a first or last name over 80 chars as invalid, 80 is kept", () => {
    const ok = "A".repeat(80);
    const { rows, invalid } = parseContactsCsv(
      `email,first_name,last_name\na@x.com,${ok},x\nb@x.com,${"A".repeat(81)},x\nc@x.com,x,${"B".repeat(81)}`,
    );
    expect(rows).toEqual([{ email: "a@x.com", firstName: ok, lastName: "x" }]);
    expect(invalid).toBe(2);
  });

  it("keeps a comma inside quotes in one field", () => {
    const { rows } = parseContactsCsv('email,first_name\n"a@x.com","Smith, Ann"');
    expect(rows).toEqual([{ email: "a@x.com", firstName: "Smith, Ann" }]);
  });

  it("keeps a newline inside quotes in one field", () => {
    const { rows } = parseContactsCsv('email,first_name\na@x.com,"Ann\nSmith"\nb@x.com,Bo');
    expect(rows).toEqual([
      { email: "a@x.com", firstName: "Ann\nSmith" },
      { email: "b@x.com", firstName: "Bo" },
    ]);
  });

  it("runs an unterminated quote to end of file as one field", () => {
    const { rows, invalid } = parseContactsCsv('email,first_name\na@x.com,"Ann\nb@x.com,Bob');
    expect(rows).toEqual([{ email: "a@x.com", firstName: "Ann\nb@x.com,Bob" }]);
    expect(invalid).toBe(0);
  });

  it("throws when there is no email header", () => {
    expect(() => parseContactsCsv("name\nPriya")).toThrow("missing email column");
  });

  it("throws above 10,000 data rows", () => {
    const body = Array.from({ length: 10_001 }, (_, i) => `u${i}@x.com`).join("\n");
    expect(() => parseContactsCsv(`email\n${body}`)).toThrow("too many rows");
  });
});
