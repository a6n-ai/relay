import { sql } from "drizzle-orm";
import { securityDb } from "../../db/security/client";
import { rateLimit } from "../../db/security/schema";
import type { Env } from "../../env";
import { newId } from "../../shared/ids";
import { toHex } from "../../core/crypto";

const WINDOW_S = 600;

// Per-IP limits for better-auth's own limiter, all over one window. Paths absent here use better-auth's default.
const PATH_MAX = {
  "/email-otp/send-verification-otp": 5,
  "/sign-in/email-otp": 5,
  "/sign-in/email": 10,
  "/request-password-reset": 5,
  "/change-password": 5,
  "/reset-password": 10,
  "/email-otp/check-verification-otp": 5,
} as const;

export const customRules = {
  "/get-session": false as const,
  ...Object.fromEntries(Object.entries(PATH_MAX).map(([path, max]) => [path, { window: WINDOW_S, max }])),
};

// The same paths also count per address, so rotating IPs cannot mail-bomb or guess against one address. The scope names are stored in the key.
const EMAIL_SCOPE: Partial<Record<string, string>> = {
  "/email-otp/send-verification-otp": "otp-email",
  "/sign-in/email": "pw-email",
  "/request-password-reset": "reset-email",
};

// One upsert keeps the count race-free. Resolves true for paths with no per-address cap.
export async function emailWithinCap(env: Env, path: string, email: string): Promise<boolean> {
  const scope = EMAIL_SCOPE[path];
  if (!scope) return true;
  const now = Date.now();
  const hex = toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email))));
  const expired = sql`${rateLimit.lastRequest} < ${now - WINDOW_S * 1000}`;
  const [row] = await securityDb(env)
    .insert(rateLimit)
    .values({ id: newId("rtl"), key: `${scope}:${hex}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
    })
    .returning({ count: rateLimit.count });
  return row.count <= PATH_MAX[path as keyof typeof PATH_MAX];
}
