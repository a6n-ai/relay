import { describe, expect, it } from "vitest";
import {
  mailboxThreadingFromProviderId,
  normalizeMessageId,
  parseMessageIdList,
  threadIdForInbound,
  threadIdForOutbound,
} from "./mailbox-thread";

describe("normalizeMessageId", () => {
  it.each([
    { raw: "<abc@relay.test>", want: "<abc@relay.test>" },
    { raw: "abc@relay.test", want: "<abc@relay.test>" },
    { raw: "  <abc@relay.test>  ", want: "<abc@relay.test>" },
    { raw: "\txyz@host\n", want: "<xyz@host>" },
    { raw: "", want: null },
    { raw: "   ", want: null },
    { raw: "<>", want: null },
    { raw: null, want: null },
    { raw: undefined, want: null },
  ])("normalizes $raw", ({ raw, want }) => {
    expect(normalizeMessageId(raw)).toBe(want);
  });

  it("does not throw on malformed input", () => {
    expect(() => normalizeMessageId("<<<")).not.toThrow();
    expect(normalizeMessageId("<<<")).toBeNull();
  });
});

describe("threadIdForOutbound", () => {
  it("equals the normalized Message-ID", () => {
    expect(threadIdForOutbound({ rfcMessageId: "abc@relay.test" })).toBe("<abc@relay.test>");
    expect(threadIdForOutbound({ rfcMessageId: "<abc@relay.test>" })).toBe("<abc@relay.test>");
  });
});

describe("threadIdForInbound", () => {
  const own = "<own@relay.test>";

  it("uses In-Reply-To as the parent when References is empty", () => {
    expect(
      threadIdForInbound({ inReplyTo: "<parent@relay.test>", references: null, fallback: own }),
    ).toBe("<parent@relay.test>");
  });

  it("walks References to the root (first id)", () => {
    expect(
      threadIdForInbound({
        inReplyTo: "<parent@relay.test>",
        references: "<root@relay.test> <parent@relay.test>",
        fallback: own,
      }),
    ).toBe("<root@relay.test>");
  });

  it("starts a new thread from its own Message-ID when headers are empty", () => {
    expect(threadIdForInbound({ inReplyTo: null, references: "", fallback: own })).toBe(own);
  });

  it("does not use a Re: subject as the thread key", () => {
    expect(
      threadIdForInbound({
        inReplyTo: "<parent@relay.test>",
        references: null,
        fallback: own,
        subject: "Re: Order ready",
      }),
    ).toBe("<parent@relay.test>");
  });

  it("does not throw on malformed headers", () => {
    expect(() =>
      threadIdForInbound({ inReplyTo: "   ", references: "not-an-id,,,,", fallback: own }),
    ).not.toThrow();
    expect(threadIdForInbound({ inReplyTo: "   ", references: "not-an-id,,,,", fallback: own })).toBe(
      "<not-an-id>",
    );
  });
});

describe("parseMessageIdList", () => {
  it("skips empty tokens", () => {
    expect(parseMessageIdList("  ,  <a@b>  ")).toEqual(["<a@b>"]);
  });
});

describe("mailboxThreadingFromProviderId", () => {
  it("stores a provider id as rfc_message_id and thread_id", () => {
    expect(mailboxThreadingFromProviderId("<abc@relay.test>")).toEqual({
      rfcMessageId: "<abc@relay.test>",
      threadId: "<abc@relay.test>",
    });
  });
});
