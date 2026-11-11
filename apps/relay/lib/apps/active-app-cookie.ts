/** Cookie holding the active app public id (UI preference within a workspace). */
export const ACTIVE_APP_COOKIE = "relay_active_app";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Client: read the active-app cookie. */
export function readActiveAppCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_APP_COOKIE}=([^;]*)`));
  const value = match?.[1] ? decodeURIComponent(match[1]) : null;
  return value && value.length > 0 ? value : null;
}

/** Client: set or clear the active-app cookie. */
export function writeActiveAppCookie(publicId: string | null) {
  if (typeof document === "undefined") return;
  if (!publicId) {
    document.cookie = `${ACTIVE_APP_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${ACTIVE_APP_COOKIE}=${encodeURIComponent(publicId)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}
