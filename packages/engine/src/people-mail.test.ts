import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MemoryPeopleMailClient,
  PEOPLE_MAIL_ERRORS,
  PeopleMailError,
  assertPeopleMailboxEmail,
  dnsHints,
} from "./people-mail";

const SES = "email-smtp.us-east-1.amazonaws.com";
const secret = "people-mail-test";

describe("assertPeopleMailboxEmail", () => {
  it("rejects an address on a sending-only domain", () => {
    expect(() => assertPeopleMailboxEmail("vishwas@tiffingrab.ca", ["tiffingrab.ca"])).toThrow(PeopleMailError);
    try {
      assertPeopleMailboxEmail("vishwas@tiffingrab.ca", ["tiffingrab.ca"]);
    } catch (err) {
      expect((err as PeopleMailError).code).toBe("sending_domain");
      expect((err as PeopleMailError).status).toBe(400);
    }
  });

  it("allows a people hostname that is not the From domain", () => {
    expect(assertPeopleMailboxEmail("vishwas@mail.tiffingrab.ca", ["tiffingrab.ca"])).toEqual({
      local: "vishwas",
      domain: "mail.tiffingrab.ca",
    });
  });

  it("rejects invalid email", () => {
    expect(() => assertPeopleMailboxEmail("not-an-email", [])).toThrow(PeopleMailError);
  });
});

describe("dnsHints", () => {
  it("returns MX/SRV for the people domain and never a SES sending hostname", () => {
    const hints = dnsHints("mail.tiffingrab.ca", { sendingHostnames: [SES, "amazonses.com"] });
    expect(hints.some((h) => h.type === "MX")).toBe(true);
    expect(hints.some((h) => h.type === "SRV")).toBe(true);
    expect(hints.every((h) => h.purpose === "Mail for this domain")).toBe(true);
    const blob = JSON.stringify(hints).toLowerCase();
    expect(blob).not.toContain("amazonses");
    expect(blob).not.toContain("email-smtp");
    expect(blob).not.toContain(SES);
  });

  it("refuses hints when the people domain is itself a sending hostname", () => {
    expect(() => dnsHints(SES, { sendingHostnames: [SES] })).toThrow(PeopleMailError);
  });
});

describe("MemoryPeopleMailClient", () => {
  it("ensureDomain / createAccount / disableAccount with auth", () => {
    const client = new MemoryPeopleMailClient({
      secret,
      sendingDomains: ["tiffingrab.ca"],
      sendingHostnames: [SES],
    });
    client.ensureDomain("mail.tiffingrab.ca", secret);
    expect(client.createAccount("vishwas@mail.tiffingrab.ca", secret)).toEqual({
      email: "vishwas@mail.tiffingrab.ca",
    });
    client.disableAccount("vishwas@mail.tiffingrab.ca", secret);
  });

  it("returns 401 without the secret", () => {
    const client = new MemoryPeopleMailClient({ secret, sendingDomains: [] });
    try {
      client.ensureDomain("mail.example.com", "wrong");
      expect.unreachable();
    } catch (err) {
      expect((err as PeopleMailError).status).toBe(401);
      expect((err as PeopleMailError).toJSON()).toEqual(PEOPLE_MAIL_ERRORS.unauthorized);
    }
  });

  it("returns 409 when the address exists", () => {
    const client = new MemoryPeopleMailClient({ secret, sendingDomains: [] });
    client.createAccount("a@mail.example.com", secret);
    try {
      client.createAccount("a@mail.example.com", secret);
      expect.unreachable();
    } catch (err) {
      expect((err as PeopleMailError).status).toBe(409);
      expect((err as PeopleMailError).toJSON()).toEqual(PEOPLE_MAIL_ERRORS.exists);
    }
  });

  it("rejects quota overflow", () => {
    const client = new MemoryPeopleMailClient({ secret, sendingDomains: [], maxAccounts: 1 });
    client.createAccount("a@mail.example.com", secret);
    expect(() => client.createAccount("b@mail.example.com", secret)).toThrow(PeopleMailError);
  });

  it("rejects creating an address on a sending-only domain", () => {
    const client = new MemoryPeopleMailClient({ secret, sendingDomains: ["send.example"] });
    expect(() => client.createAccount("ops@send.example", secret)).toThrow(PeopleMailError);
  });
});

describe("people-mail error fixtures", () => {
  it("matches 401 and 409 contract payloads", () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), "people-mail/fixtures/errors.json");
    const fixture = JSON.parse(readFileSync(file, "utf8")) as typeof PEOPLE_MAIL_ERRORS;
    expect(fixture.unauthorized).toEqual(PEOPLE_MAIL_ERRORS.unauthorized);
    expect(fixture.exists).toEqual(PEOPLE_MAIL_ERRORS.exists);
  });
});
