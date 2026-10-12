import { describe, expect, it } from "vitest";
import { FLOW_STEPS, parseStep, stepGate } from "./steps";

describe("flow steps", () => {
  it("has three steps in order", () => {
    expect(FLOW_STEPS.map((s) => s.label)).toEqual(["Content", "Audience", "Review & Send"]);
  });
  it("falls back to content for a missing or unknown step", () => {
    expect([parseStep(undefined), parseStep("nope"), parseStep("review")]).toEqual(["content", "content", "review"]);
  });
});

describe("stepGate", () => {
  it("needs a subject and content to leave Content", () => {
    expect(stepGate({ hasSubject: false, hasContent: true, eligible: 5 })).toMatchObject({ canLeaveContent: false, reason: "Add a subject line to continue." });
    expect(stepGate({ hasSubject: true, hasContent: false, eligible: 5 })).toMatchObject({ canLeaveContent: false, reason: "Add the email content to continue." });
  });
  it("needs at least one eligible recipient to leave Audience", () => {
    expect(stepGate({ hasSubject: true, hasContent: true, eligible: 0 })).toEqual({
      canLeaveContent: true,
      canLeaveAudience: false,
      reason: "No one is eligible yet. Pick a list or a rule; if you have, everyone in it is unsubscribed, suppressed or missing consent.",
    });
  });
  it("is undecided while the count is still loading", () => {
    expect(stepGate({ hasSubject: true, hasContent: true, eligible: null })).toMatchObject({ canLeaveAudience: false, reason: null });
  });
  it("opens every step when all is in place", () => {
    expect(stepGate({ hasSubject: true, hasContent: true, eligible: 3 })).toEqual({ canLeaveContent: true, canLeaveAudience: true, reason: null });
  });
});

describe("stepGate — review minors", () => {
  it("words the content hint for a text channel", () => {
    expect(stepGate({ hasSubject: true, hasContent: false, eligible: 1, email: false }).reason).toBe("Add the message to continue.");
  });
});
