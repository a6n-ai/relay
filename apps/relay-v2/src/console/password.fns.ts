import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { and, eq, isNotNull } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { securityDb } from "../db/security/client";
import { account } from "../db/security/schema";
import { createAuth } from "../lib/auth";
import { assertSameOrigin, ConsoleError, requireSession, toResponseError } from "./actor";
import { validate } from "./schemas";

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
    toResponseError(err);
  }
});

// setPassword is server-only in better-auth: it has no HTTP route, so this function is the only way in, and it needs the session.
export const setPasswordFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ newPassword: z.string().min(8).max(128) })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      await requireSession(env, headers);
      assertSameOrigin(env, headers);
      try {
        await createAuth(env).api.setPassword({ headers, body: { newPassword: data.newPassword } });
      } catch (err) {
        if (isAPIError(err) && err.statusCode === 400) throw new ConsoleError(409, "password already set");
        throw err;
      }
    } catch (err) {
      toResponseError(err);
    }
  });
