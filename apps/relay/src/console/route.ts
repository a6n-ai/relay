import { env } from "cloudflare:workers";
import { describeError } from "../core/log";
import { statusOf } from "../shared/errors";
import type { Env } from "../env";
import type { Principal } from "../services/principal";
import { requireActor } from "./actor";
import type { Need } from "./needs";

type ConsoleCtx = { env: Env; p: Principal; request: Request; params: Record<string, string> };

// The one session-auth and error path for console routes that answer a file instead of a server function.
export function consoleRoute(what: string, need: Need, handler: (ctx: ConsoleCtx) => Promise<Response>) {
  return async ({ request, params }: { request: Request; params: Record<string, string> }): Promise<Response> => {
    try {
      const p = await requireActor(env, request.headers, need);
      return await handler({ env, p, request, params });
    } catch (err) {
      const status = statusOf(err);
      if (status) return Response.json({ error: (err as Error).message }, { status });
      console.error(`console ${what} failed`, ...Object.values(params), describeError(err));
      return Response.json({ error: "internal error" }, { status: 500 });
    }
  };
}
