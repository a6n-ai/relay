import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The server fns cannot be called over HTTP under vitest (TSS_SERVER_FN_BASE is unset there), so the 400 is checked at the validator.
const setResponseStatus = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start/server", () => ({ setResponseStatus }));

import { slug, validate } from "../src/console/schemas";
import { memberInput } from "../src/shared/schemas";
import { name } from "../src/services/schemas";
import { campaignPatch } from "../src/services/schemas";
import { errorText } from "../src/components/error-text";

describe("validate", () => {
  it("returns the parsed value for a good body", () => {
    expect(validate(z.object({ name: z.string().trim().min(1) }))({ name: "  Acme  " })).toEqual({ name: "Acme" });
  });

  it("throws 'invalid input' with status 400 for a bad body, and never the issue JSON", () => {
    setResponseStatus.mockClear();
    const check = validate(z.object({ slug }));
    expect(() => check({ slug: "Acme Co" })).toThrow(new Error("invalid input"));
    expect(setResponseStatus).toHaveBeenCalledWith(400);
  });
});

describe("memberInput consentAt", () => {
  it("rejects a consentAt in the future with 400 and accepts a past one", () => {
    setResponseStatus.mockClear();
    const check = validate(memberInput);
    expect(() => check({ email: "a@x.test", consentAt: Date.now() + 86_400_000 })).toThrow(new Error("invalid input"));
    expect(setResponseStatus).toHaveBeenCalledWith(400);
    expect(check({ email: "a@x.test", consentAt: Date.now() - 1000 }).consentAt).toBeLessThan(Date.now());
  });

  it("refuses a campaign subject with a line break", () => {
    const check = validate(campaignPatch);
    expect(() => check({ subject: "Hi\r\nBcc: x@y.z" })).toThrow(new Error("invalid input"));
    expect(check({ subject: "Hi" })).toEqual({ subject: "Hi" });
  });
});

describe("rename name", () => {
  it("rejects an empty or blank name with 400 invalid input", () => {
    setResponseStatus.mockClear();
    const check = validate(z.object({ id: z.string(), name }));
    expect(() => check({ id: "a", name: "   " })).toThrow(new Error("invalid input"));
    expect(setResponseStatus).toHaveBeenCalledWith(400);
    expect(check({ id: "a", name: " Ok " })).toEqual({ id: "a", name: "Ok" });
  });
});

describe("errorText", () => {
  it("maps a known server message to plain copy", () => {
    expect(errorText(new Error("forbidden"))).toBe("Your role can't do this in this workspace.");
  });

  it("falls back for an unknown message or a prototype key, never the raw text", () => {
    expect(errorText(new Error("invite limit reached"))).toBe("This workspace has reached its daily invite limit. Try again tomorrow.");
    expect(errorText(new Error("invite expired"))).toBe("This invite is no longer open.");
    expect(errorText(new Error("constructor"))).toBe("Something went wrong. Try again.");
    expect(errorText(new Error("forbidden-ish"), "Could not save.")).toBe("Could not save.");
  });
});
