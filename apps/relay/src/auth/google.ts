import type { Env } from "../env";

// Better Auth's link-social flow carries `link` in the OAuth state; a plain sign-in does not.
type OAuthFlow = "sign-in" | "link";

// Platform admins (Better Auth admin plugin role, possibly comma-separated) link Google only while signed in.
export function refusesImplicitLink(role: string | null | undefined, flow: OAuthFlow): boolean {
  return flow === "sign-in" && (role ?? "").split(",").includes("admin");
}

// A callback whose OAuth state carries `link` is a /link-social link, never a sign-in.
export function auditKindFor(path: string, state: { link?: unknown } | null | undefined): "account.link" | "sign_in" | null {
  if (!path.startsWith("/callback/")) return null;
  return state?.link ? "account.link" : "sign_in";
}

export function googleConfig(env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;
  return clientId && clientSecret ? { clientId, clientSecret, disableSignUp: true as const, prompt: "select_account" as const } : null;
}
