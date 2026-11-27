import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { and, eq, isNotNull } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { securityDb } from "../db/security/client";
import { account } from "../db/security/schema";
import { createAuth, isFreshSession, recordPasswordChange, STALE_SESSION_MESSAGE } from "../lib/auth";
import { fail } from "./guard";
import { assertSameOrigin, requireSession } from "../core/session";
import { validate } from "./schemas";
import { RelayError } from "../shared/errors";
import { PASSWORD_MAX, PASSWORD_MIN } from "../shared/limits";

export const passwordStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<{ hasPassword: boolean }> => {
  try {
    const { userId } = await requireSession(env, getRequestHeaders());
    const rows = await securityDb(env)
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential"), isNotNull(account.password)))
      .limit(1);
    return { hasPassword: rows.length > 0 };
  } catch (err) {
    fail(err);
  }
});

// setPassword is server-only in better-auth: it has no HTTP route, so this function is the only way in, and it needs the session.
export const setPasswordFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ newPassword: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX) })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const auth = createAuth(env);
      const current = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
      if (!current) throw new RelayError("unauthorized");
      assertSameOrigin(env, headers);
      if (current.session.impersonatedBy || !isFreshSession(current.session.createdAt)) throw new RelayError("forbidden", 403, STALE_SESSION_MESSAGE);
      try {
        await auth.api.setPassword({ headers, body: { newPassword: data.newPassword } });
      } catch (err) {
        if (isAPIError(err) && err.body?.code === "PASSWORD_ALREADY_SET") throw new RelayError("password already set");
        throw err;
      }
      await recordPasswordChange(env, current.user, "password.set", {
        ip: headers.get("cf-connecting-ip"),
        userAgent: headers.get("user-agent"),
      });
    } catch (err) {
      fail(err);
    }
  });
