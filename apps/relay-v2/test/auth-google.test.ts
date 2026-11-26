import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createAuth } from "../src/lib/auth";
import { googleConfig, signInErrorText } from "../src/lib/auth/google";
import type { Env } from "../src/env";

describe("googleConfig", () => {
  it("is null without both keys", () => {
    expect(googleConfig({})).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "id" })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_SECRET: "s" })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "s" })).toBeNull();
  });
  it("is sign-up disabled with both keys", () => {
    expect(googleConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" })).toEqual({
      clientId: "id",
      clientSecret: "s",
      disableSignUp: true,
    });
  });
});

describe("signInErrorText", () => {
  it("maps codes to copy", () => {
    expect(signInErrorText("signup_disabled", "a@b.com")).toBe(
      "No Relay account for a@b.com. Ask your workspace owner for an invite.",
    );
    expect(signInErrorText("weird")).toBe("Could not sign in with Google. Try again or use your email.");
    expect(signInErrorText(undefined)).toBeNull();
  });
});

describe("createAuth google provider", () => {
  it("is not registered without keys", () => {
    const auth = createAuth({ ...env, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined } as Env);
    expect(auth.options.socialProviders?.google).toBeUndefined();
  });
  it("is invite-only and links on a verified Google email only", () => {
    const auth = createAuth({ ...env, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" } as Env);
    expect(auth.options.socialProviders?.google?.disableSignUp).toBe(true);
    const linking = auth.options.account?.accountLinking;
    expect(linking?.enabled).toBe(true);
    // Trusting google by name would link unverified Google emails.
    expect((linking as { trustedProviders?: string[] }).trustedProviders ?? []).not.toContain("google");
    // Invites pre-create users with emailVerified false; the default would refuse to link them.
    expect(linking?.requireLocalEmailVerified).toBe(false);
  });
  it.todo("a mocked Google profile with no user row is refused and creates no user or account row (token exchange needs a Google network mock; covered in the browser pass)");
});
