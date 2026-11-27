// Better Auth redirects here with ?error=signup_disabled when the Google email has no user row.
const NO_ACCOUNT_CODE = "signup_disabled";

// Set on the error redirect when a platform admin tries to link Google through the sign-in callback.
export const ADMIN_LINK_CODE = "platform_admin_link_required";

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
