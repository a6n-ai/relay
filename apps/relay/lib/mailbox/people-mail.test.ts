import { describe, expect, it } from "vitest";
import { assertPeopleMailboxEmail, PeopleMailError } from "@relay/engine";
import { domainOf } from "@/lib/email/sender-domain";

describe("people mailbox vs sending domain", () => {
  it("rejects creating an address on a sending-only domain", () => {
    const sending = ["tiffingrab.ca"];
    const email = "hello@tiffingrab.ca";
    expect(domainOf(email)).toBe("tiffingrab.ca");
    expect(() => assertPeopleMailboxEmail(email, sending)).toThrow(PeopleMailError);
  });

  it("allows a people hostname beside the sending domain", () => {
    expect(assertPeopleMailboxEmail("hello@mail.tiffingrab.ca", ["tiffingrab.ca"]).domain).toBe(
      "mail.tiffingrab.ca",
    );
  });
});
