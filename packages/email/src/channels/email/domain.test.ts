import { describe, expect, it } from "vitest";
import {
  buildSendingDomainRecords,
  DOMAIN_VERIFY_HOST,
  generateDkimKeyPair,
  generateDomainVerifyToken,
  normalizeDomain,
  ownershipTxtValue,
  pemToDkimPublic,
  verifySendingDomainOwnership,
} from "./domain";

describe("buildSendingDomainRecords", () => {
  it("emits ownership, SPF, DKIM, and DMARC TXT records", () => {
    const records = buildSendingDomainRecords({
      domain: "TiffinGrab.CA.",
      token: "abc",
      dkimP: "PUBKEY",
      spfInclude: "amazonses.com",
    });
    expect(records).toEqual(
      expect.arrayContaining([
        { type: "TXT", host: DOMAIN_VERIFY_HOST, value: "relay-domain-verify=abc", purpose: "ownership" },
        { type: "TXT", host: "@", value: "v=spf1 include:amazonses.com ~all", purpose: "spf" },
        { type: "TXT", host: "relay._domainkey", value: "v=DKIM1; k=rsa; p=PUBKEY", purpose: "dkim" },
        {
          type: "TXT",
          host: "_dmarc",
          value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@tiffingrab.ca",
          purpose: "dmarc",
        },
      ]),
    );
  });
});

describe("verifySendingDomainOwnership", () => {
  it("passes when the TXT includes the token, even if chunked", async () => {
    const ok = await verifySendingDomainOwnership("example.com", "tok", async () => [
      ["relay-domain-verify=", "tok"],
    ]);
    expect(ok).toBe(true);
  });

  it("fails when the record is missing or DNS errors", async () => {
    await expect(
      verifySendingDomainOwnership("example.com", "tok", async () => [["v=spf1 mx ~all"]]),
    ).resolves.toBe(false);
    await expect(
      verifySendingDomainOwnership("example.com", "tok", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).resolves.toBe(false);
  });
});

describe("pemToDkimPublic", () => {
  it("strips PEM wrapping", () => {
    expect(pemToDkimPublic("-----BEGIN PUBLIC KEY-----\nAB\nCD\n-----END PUBLIC KEY-----")).toBe("ABCD");
  });
});

describe("ownershipTxtValue", () => {
  it("prefixes the token", () => {
    expect(ownershipTxtValue("x")).toBe("relay-domain-verify=x");
  });
});

describe("normalizeDomain", () => {
  it("trims, lowercases, and strips a trailing dot", () => {
    expect(normalizeDomain(" Example.COM. ")).toBe("example.com");
  });
});

describe("generateDomainVerifyToken / generateDkimKeyPair", () => {
  it("issues a hex token and a DKIM p= without PEM headers", () => {
    const token = generateDomainVerifyToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const keys = generateDkimKeyPair();
    expect(keys.dkimP).not.toMatch(/BEGIN/);
    expect(keys.dkimP.length).toBeGreaterThan(100);
    expect(keys.privateKeyPem).toMatch(/BEGIN PRIVATE KEY/);
  });
});

describe("buildSendingDomainRecords without DKIM", () => {
  it("emits mx SPF when include is omitted", () => {
    const records = buildSendingDomainRecords({ domain: "example.com", token: "t" });
    expect(records.find((r) => r.purpose === "spf")?.value).toBe("v=spf1 mx ~all");
    expect(records.some((r) => r.purpose === "dkim")).toBe(false);
  });
});
