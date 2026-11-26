import type { Env } from "../../env";

// Better Auth redirects here with ?error=signup_disabled when the Google email has no user row.
export const NO_ACCOUNT_CODE = "signup_disabled";

// Set on the error redirect when a platform admin tries to link Google through the sign-in callback.
export const ADMIN_LINK_CODE = "platform_admin_link_required";

// Better Auth's link-social flow carries `link` in the OAuth state; a plain sign-in does not.
export type OAuthFlow = "sign-in" | "link";

// Platform admins (Better Auth admin plugin role, possibly comma-separated) link Google only while signed in.
export function refusesImplicitLink(role: string | null | undefined, flow: OAuthFlow): boolean {
  return flow === "sign-in" && (role ?? "").split(",").includes("admin");
}

export function googleConfig(env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;
  return clientId && clientSecret ? { clientId, clientSecret, disableSignUp: true as const } : null;
}

export function signInErrorText(code: string | undefined): string | null {
  if (!code) return null;
  if (code === NO_ACCOUNT_CODE) {
    return "No Relay account for that email. Ask your workspace owner for an invite.";
  }
  if (code === ADMIN_LINK_CODE) {
    return "Platform admins sign in with an email code first, then link Google from their account.";
  }
  return "Could not sign in with Google. Try again or use your email.";
}
