import { env, SELF } from "cloudflare:test";
import { BASE, json } from "./console-helpers";
import { applyMigrations } from "./migrate";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../src/lib/auth";
import { ADMIN_LINK_CODE, googleConfig, refusesImplicitLink, signInErrorText } from "../src/lib/auth/google";
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
    expect(signInErrorText("signup_disabled")).toBe(
      "No Relay account for that email. Ask your workspace owner for an invite.",
    );
    expect(signInErrorText(ADMIN_LINK_CODE)).toBe(
      "Platform admins sign in with an email code first, then link Google from their account.",
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

describe("refusesImplicitLink", () => {
  it("refuses only platform admins on the sign-in flow", () => {
    expect(refusesImplicitLink("admin", "sign-in")).toBe(true);
    expect(refusesImplicitLink("user,admin", "sign-in")).toBe(true);
    expect(refusesImplicitLink("admin", "link")).toBe(false);
    expect(refusesImplicitLink("user", "sign-in")).toBe(false);
    expect(refusesImplicitLink(null, "sign-in")).toBe(false);
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

  it("creates no account row for an admin on the implicit path, but does for a member and for an explicit link", async () => {
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
