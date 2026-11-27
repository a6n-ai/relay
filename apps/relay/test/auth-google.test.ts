import { env } from "cloudflare:test";
import { BASE, json } from "./console-helpers";
import { applyMigrations } from "./migrate";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../src/auth";
import { auditKindFor, googleConfig, refusesImplicitLink } from "../src/auth/google";
import { ADMIN_LINK_CODE, signInErrorText } from "../src/shared/sign-in";
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
      prompt: "select_account",
    });
  });
});

describe("signInErrorText", () => {
  it("maps codes to copy", () => {
    expect(signInErrorText("signup_disabled")).toBe(
      "No Relay account for that email. Ask your workspace owner for an invite.",
    );
    expect(signInErrorText(ADMIN_LINK_CODE)).toBe(
      "Platform admins sign in with an email code first, then link Google from their account.",
    );
    expect(signInErrorText("weird")).toBe("Could not sign in with Google. Try again or use your email.");
    expect(signInErrorText("state_mismatch")).toBe("Could not sign in with Google. Try again or use your email.");
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
});

describe("refusesImplicitLink", () => {
  it("refuses only platform admins on the sign-in flow", () => {
    expect(refusesImplicitLink("admin", "sign-in")).toBe(true);
    expect(refusesImplicitLink("user,admin", "sign-in")).toBe(true);
    expect(refusesImplicitLink("admin", "link")).toBe(false);
    expect(refusesImplicitLink("user", "sign-in")).toBe(false);
    expect(refusesImplicitLink(null, "sign-in")).toBe(false);
  });
});

describe("auditKindFor", () => {
  it("audits a callback with link state as account.link, otherwise as sign-in", () => {
    expect(auditKindFor("/callback/google", { link: { userId: "u", email: "e" } })).toBe("account.link");
    expect(auditKindFor("/callback/google", {})).toBe("sign_in");
    expect(auditKindFor("/callback/google", null)).toBe("sign_in");
    expect(auditKindFor("/sign-in/email-otp", { link: {} })).toBeNull();
  });
});

describe("google flows with Google configured", () => {
  const google = { ...env, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" } as Env;
  beforeAll(applyMigrations);

  it("refuses an idToken body on /sign-in/social", async () => {
    const res = await createAuth(google).handler(
      new Request(`${BASE}/sign-in/social`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ provider: "google", idToken: { token: "x" } }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("refuses an idToken body on /link-social", async () => {
    const res = await createAuth(google).handler(
      new Request(`${BASE}/link-social`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ provider: "google", idToken: { token: "x" } }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("creates no account row for an admin on the implicit path, but does for a member", async () => {
    const ctx = await createAuth(google).$context;
    const mk = async (role: string, tag: string) =>
      (await ctx.internalAdapter.createUser({ email: `${tag}@example.com`, name: tag, emailVerified: true, role }, undefined as never)).id;
    const link = (userId: string) =>
      ctx.internalAdapter.linkAccount({ providerId: "google", accountId: `g-${userId}`, userId });
    const rows = async (userId: string) => ctx.internalAdapter.findAccounts(userId);

    const admin = await mk("admin", "adm-implicit");
    await link(admin).catch(() => null);
    expect(await rows(admin)).toHaveLength(0);

    const member = await mk("user", "mem-implicit");
    await link(member);
    expect(await rows(member)).toHaveLength(1);
  });
});
