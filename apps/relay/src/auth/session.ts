import type { Env } from "../env";
import { createAuth } from "./index";
import { RelayError } from "../shared/errors";
import { ORG_ROLES, type OrgRole } from "../shared/roles";

// The cookie cache can hold a role or suspension decision from before a change, so the session is read from the database.
export async function requireSession(
  env: Env,
  headers: Headers,
): Promise<{ userId: string; platformAdmin: boolean; activeWorkspaceId: string | null }> {
  const session = await createAuth(env).api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session) throw new RelayError("unauthorized");
  return {
    userId: session.user.id,
    platformAdmin: session.user.role === "admin",
    activeWorkspaceId: session.session.activeOrganizationId ?? null,
  };
}

const isOrgRole = (role: string): role is OrgRole => (ORG_ROLES as readonly string[]).includes(role);
export const parseRoles = (raw: string): OrgRole[] => raw.split(",").map((r) => r.trim()).filter(isOrgRole);

// D1 names the violated index in the message; drizzle may wrap the error, so the cause chain is walked too.
export function uniqueViolation(err: unknown, column: string): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if (e.message.includes(`UNIQUE constraint failed: ${column}`)) return true;
  }
  return false;
}

export function assertSameOrigin(env: Env, headers: Headers): void {
  const origin = headers.get("origin");
  if (origin !== null && origin !== new URL(env.BETTER_AUTH_URL).origin) {
    throw new RelayError("cross-origin write");
  }
}
