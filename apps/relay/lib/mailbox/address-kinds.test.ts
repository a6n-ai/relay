import { describe, expect, it } from "vitest";
import { defaultKindForNewMailbox, mailboxStoreForKind } from "./address-kinds";

describe("mailboxStoreForKind", () => {
  it("never dual-writes", () => {
    expect(mailboxStoreForKind("send_as")).toBe("none");
    expect(mailboxStoreForKind("relay_inbox")).toBe("postgres");
    expect(mailboxStoreForKind("people_inbox")).toBe("people_host");
  });
});

describe("defaultKindForNewMailbox", () => {
  it("treats receipts as send-as and support as a Relay inbox", () => {
    expect(defaultKindForNewMailbox("receipts")).toBe("send_as");
    expect(defaultKindForNewMailbox("support")).toBe("relay_inbox");
    expect(defaultKindForNewMailbox("hello")).toBe("people_inbox");
  });
});
