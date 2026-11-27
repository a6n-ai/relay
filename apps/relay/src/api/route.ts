import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { resolveBearer, withinRateLimit } from "../services/api-keys";
import { type KeyScope } from "../shared/scope";
import { logFailure } from "../core/log";
import { codeOf, ERRORS, RelayError } from "../shared/errors";
import type { Env } from "../env";

type ApiCtx = { env: Env; scope: KeyScope; request: Request; params: Record<string, string> };

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const data = (value: unknown, status = 200) => Response.json({ data: value }, { status });
export const readJson = (request: Request): Promise<unknown> => request.json().catch(() => undefined);

// The one auth and rate-limit path for /api/v1 routes. A malformed body is a 400, never a 500.
export function apiRoute(handler: (ctx: ApiCtx) => Promise<Response>) {
  return async ({ request, params }: { request: Request; params: Record<string, string> }): Promise<Response> => {
    const scope = await resolveBearer(env, request);
    if (!scope) return json({ error: "unauthorized" }, 401);
    if (!(await withinRateLimit(env, scope.keyId))) return json({ error: "rate limited" }, 429);
    try {
      return await handler({ env, scope, request, params });
    } catch (err) {
      const where = `api ${request.method} ${new URL(request.url).pathname} key=${scope.keyId}`;
      const fail = (error: string, status: number, cause: unknown = err) => {
        logFailure(where, status, cause);
        return json({ error }, status);
      };
      if (err instanceof ZodError) {
        // Field paths and issue codes only: the submitted values stay out of the log.
        return fail("invalid input", 400, `invalid input at ${err.issues.map((i) => `${i.path.join(".") || "(root)"}:${i.code}`).join(", ")}`);
      }
      if (err instanceof RelayError) return fail(err.message, err.status);
      // ClientDO errors cross RPC as plain Errors that keep only the code.
      const code = codeOf(err);
      if (code) return fail(code, ERRORS[code].status);
      logFailure(where, 500, err);
      throw err;
    }
  };
}
