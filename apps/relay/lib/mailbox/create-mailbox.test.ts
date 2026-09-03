import { describe, expect, it } from "vitest";
import { planNewMailbox } from "./create-mailbox";

const sending = ["shop.test"];

describe("planNewMailbox", () => {
  it("mints receipts as send-as and creates a From", () => {
    const plan = planNewMailbox({
      localPart: "receipts",
      domain: "shop.test",
      existingCount: 0,
      seatQuota: 5,
      verifiedSendingDomains: sending,
    });
    expect(plan).toMatchObject({
      email: "receipts@shop.test",
      kind: "send_as",
      store: "none",
      createSender: true,
    });
  });

  it("mints support as a Relay inbox on a ready sending domain", () => {
    const plan = planNewMailbox({
      localPart: "support",
      domain: "shop.test",
      existingCount: 1,
      seatQuota: 5,
      verifiedSendingDomains: sending,
    });
    expect(plan).toMatchObject({
      kind: "relay_inbox",
      store: "postgres",
      createSender: true,
    });
  });

  it("rejects people inbox on the sending domain", () => {
    const plan = planNewMailbox({
      localPart: "hello",
      domain: "shop.test",
      existingCount: 0,
      seatQuota: 5,
      verifiedSendingDomains: sending,
    });
    expect(plan).toEqual({
      error: "Use a people domain, not the domain Relay sends receipts from",
    });
  });

  it("allows people inbox on a side domain and does not create a From", () => {
    const plan = planNewMailbox({
      localPart: "hello",
      domain: "mail.shop.test",
      existingCount: 0,
      seatQuota: 5,
      verifiedSendingDomains: sending,
    });
    expect(plan).toMatchObject({
      kind: "people_inbox",
      store: "people_host",
      createSender: false,
    });
  });

  it("stops at the address seat limit", () => {
    expect(
      planNewMailbox({
        localPart: "news",
        domain: "shop.test",
        existingCount: 5,
        seatQuota: 5,
        verifiedSendingDomains: sending,
      }),
    ).toEqual({ error: "This app has no more addresses. Raise the address limit." });
  });

  it("lets seat quota 0 mean unlimited", () => {
    const plan = planNewMailbox({
      localPart: "news",
      domain: "shop.test",
      existingCount: 50,
      seatQuota: 0,
      verifiedSendingDomains: sending,
    });
    expect("kind" in plan && plan.kind).toBe("send_as");
  });

  it("lets the operator force Send as on a local-part that would otherwise be people mail", () => {
    expect(
      planNewMailbox({
        localPart: "hello",
        domain: "shop.test",
        kind: "send_as",
        existingCount: 0,
        seatQuota: 5,
        verifiedSendingDomains: sending,
      }),
    ).toMatchObject({ kind: "send_as", createSender: true });
  });
});
