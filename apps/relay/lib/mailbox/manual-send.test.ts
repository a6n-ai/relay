import { describe, expect, it } from "vitest";
import { letterHtmlFromPlain, manualMailboxLetter } from "./manual-send";

describe("letterHtmlFromPlain", () => {
  it("escapes markup so a typed letter cannot inject HTML", () => {
    expect(letterHtmlFromPlain("Hi <b>x</b>")).toBe("<p>Hi &lt;b&gt;x&lt;/b&gt;</p>");
  });
});

describe("manualMailboxLetter", () => {
  it("archives an operator send as outbound origin=manual", () => {
    expect(
      manualMailboxLetter({
        tenantId: 3n,
        fromEmail: "hello@mail.example.com",
        fromName: "Hello",
        toEmail: "cust@example.com",
        subject: "Hi",
        text: "On the way",
        providerMessageId: "<abc@relay.test>",
      }),
    ).toMatchObject({
      direction: "out",
      origin: "manual",
      toEmail: "cust@example.com",
      rfcMessageId: "<abc@relay.test>",
      html: "<p>On the way</p>",
    });
  });

  it("keeps a reply on the parent conversation", () => {
    expect(
      manualMailboxLetter({
        tenantId: 3n,
        fromEmail: "hello@mail.example.com",
        fromName: "Hello",
        toEmail: "cust@example.com",
        subject: "Re: Hi",
        text: "Yes",
        providerMessageId: "<reply@relay.test>",
        inReplyTo: "<abc@relay.test>",
        rfcReferences: "<abc@relay.test>",
        threadId: "<abc@relay.test>",
      }),
    ).toMatchObject({
      inReplyTo: "<abc@relay.test>",
      threadId: "<abc@relay.test>",
      origin: "manual",
    });
  });
});
