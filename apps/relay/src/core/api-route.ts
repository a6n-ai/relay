import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { resolveBearer, withinRateLimit, type KeyScope } from "./api-keys";
import { ApiError } from "./api-error";
import { logFailure } from "./log";
import { SEND_REFUSAL_STATUS, TEMPLATE_ERROR_STATUS, TemplateError, sendRefusal } from "./messages";
import type { Env } from "../env";

export type ApiCtx = { env: Env; scope: KeyScope; request: Request; params: Record<string, string> };

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const data = (value: unknown, status = 200) => Response.json({ data: value }, { status });
// Fits three 5 MB attachments as base64 plus the bodies. A chunked body has no length, so the cap is counted while reading.
export const MAX_API_BODY_BYTES = 25 * 1024 * 1024;

export async function readJson(request: Request, max = MAX_API_BODY_BYTES): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > max) throw new ApiError(413, "body too large");
  if (!request.body) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    size += r.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, "body too large");
    }
    chunks.push(r.value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

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
      if (err instanceof ApiError) return fail(err.message, err.status);
      if (err instanceof TemplateError && Object.hasOwn(TEMPLATE_ERROR_STATUS, err.message)) {
        return fail(err.message, TEMPLATE_ERROR_STATUS[err.message as keyof typeof TEMPLATE_ERROR_STATUS]);
      }
      const refusal = sendRefusal(err);
      if (refusal) return fail(refusal, SEND_REFUSAL_STATUS[refusal]);
      logFailure(where, 500, err);
      throw err;
    }
  };
}
