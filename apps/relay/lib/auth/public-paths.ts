export const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export const PUBLIC_PREFIXES = ["/api/auth", "/v1", "/login", "/forgot-password", "/api/webhooks", "/unsubscribe"];

export function isPublicRelayPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function hasSessionCookie(cookieNames: Iterable<string>): boolean {
  const set = new Set(cookieNames);
  return SESSION_COOKIES.some((name) => set.has(name));
}

/** Dashboard HTML and other /api routes require a session; /v1 is tenant-key auth. */
export function gateRelayPath(pathname: string, cookieNames: Iterable<string>): "allow" | "login" | "unauthorized" {
  if (isPublicRelayPath(pathname)) return "allow";
  if (hasSessionCookie(cookieNames)) return "allow";
  if (pathname.startsWith("/dashboard")) return "login";
  if (pathname.startsWith("/api")) return "unauthorized";
  return "allow";
}
