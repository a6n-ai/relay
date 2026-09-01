import { describe, expect, it } from "vitest";
import {
  buildSendingDomainRecords,
  DOMAIN_VERIFY_HOST,
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
