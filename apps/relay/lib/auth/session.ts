import { cache } from "react";
import { headers } from "next/headers";
import { Role, type RoleValue } from "@foundry/commons";
import { auth } from "./index";

function isDynamicServerError(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    ((e as { digest: string }).digest === "DYNAMIC_SERVER_USAGE" ||
      (e as { digest: string }).digest.startsWith("DYNAMIC_SERVER_USAGE"))
  );
}

async function loadSession(fresh: boolean) {
  let s: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  try {
    s = await auth.api.getSession({
      headers: await headers(),
      ...(fresh ? { query: { disableCookieCache: true } } : {}),
    });
  } catch (e) {
    if (isDynamicServerError(e)) throw e;
    return null;
  }
  if (!s?.user) return null;
  const u = s.user as {
    publicId?: string;
    id: string;
    role?: RoleValue;
    email?: string;
    name?: string | null;
    platformRole?: string | null;
  };
  if (!u.publicId) return null;
  const activeOrganizationId =
    (s.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId ?? null;
  return {
    user: {
      id: u.publicId,
      role: u.role ?? Role.ADMIN,
      email: u.email ?? "",
      name: u.name ?? "",
      platformRole: u.platformRole ?? null,
    },
    session: { activeOrganizationId },
  };
}

/** For page views: may use the 5 minute cookie cache. */
export const getSession = cache(() => loadSession(false));

/** For guards in front of changes: reads the database, so a revoked session or role change applies at once. */
export const getFreshSession = cache(() => loadSession(true));
