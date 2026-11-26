import type { Env } from "../../env";

// Better Auth redirects here with ?error=signup_disabled when the Google email has no user row.
export const NO_ACCOUNT_CODE = "signup_disabled";

export function googleConfig(env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;
  return clientId && clientSecret ? { clientId, clientSecret, disableSignUp: true as const } : null;
}

export function signInErrorText(code: string | undefined): string | null {
  if (!code) return null;
  if (code === NO_ACCOUNT_CODE) {
    return "No Relay account for that email. Ask your workspace owner for an invite.";
  }
  return "Could not sign in with Google. Try again or use your email.";
}
