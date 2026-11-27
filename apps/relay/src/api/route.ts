import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { resolveBearer, withinRateLimit } from "../services/api-keys";
import type { KeyPrincipal } from "../services/principal";
import { logFailure } from "../core/log";
import { ERRORS, RelayError, statusOf } from "../shared/errors";
import type { Env } from "../env";

type ApiCtx = { env: Env; p: KeyPrincipal; request: Request; params: Record<string, string> };

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const data = (value: unknown, status = 200) => Response.json({ data: value }, { status });
// Fits three 5 MB attachments as base64 plus the bodies. A chunked body has no length, so the cap is counted while reading.
export const MAX_API_BODY_BYTES = 25 * 1024 * 1024;

export async function readJson(request: Request, max = MAX_API_BODY_BYTES): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > max) throw new RelayError("body too large");
  if (!request.body) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    size += r.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new RelayError("body too large");
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
    const p = await resolveBearer(env, request);
    if (!p) return json({ error: "unauthorized" }, 401);
    if (!(await withinRateLimit(env, p.keyId))) return json({ error: "rate limited" }, ERRORS["rate limited"].status);
    try {
      return await handler({ env, p, request, params });
    } catch (err) {
      const where = `api ${request.method} ${new URL(request.url).pathname} key=${p.keyId}`;
      const fail = (error: string, status: number, cause: unknown = err) => {
        logFailure(where, status, cause);
        return json({ error }, status);
      };
      if (err instanceof ZodError) {
        // Field paths and issue codes only: the submitted values stay out of the log.
        return fail("invalid input", 400, `invalid input at ${err.issues.map((i) => `${i.path.join(".") || "(root)"}:${i.code}`).join(", ")}`);
      }
      // A ClientDO refusal crosses RPC as a plain Error that keeps only the code.
      const status = statusOf(err);
      if (status) return fail((err as Error).message, status);
      logFailure(where, 500, err);
      throw err;
    }
  };
}
