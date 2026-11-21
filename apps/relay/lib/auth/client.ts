import { createAuthClient } from "better-auth/react";
import { emailOTPClient, organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), organizationClient({ teams: { enabled: true } })],
});

export const { signIn, signOut, useSession } = authClient;
