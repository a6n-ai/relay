import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { createAuth, needsFreshSignIn, recordPasswordChange, STALE_SESSION_MESSAGE } from "../auth";
import { fail, userSession } from "./guard";
import { hasPassword } from "../services/password";
import { assertSameOrigin } from "../auth/session";
import { validate } from "./schemas";
import { RelayError } from "../shared/errors";
import { PASSWORD_MAX, PASSWORD_MIN } from "../shared/limits";

export const passwordStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<{ hasPassword: boolean }> => {
  try {
    return { hasPassword: await hasPassword(env, await userSession()) };
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
      if (needsFreshSignIn(current.session)) throw new RelayError("forbidden", 403, STALE_SESSION_MESSAGE);
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
