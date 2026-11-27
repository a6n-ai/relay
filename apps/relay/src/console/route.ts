import { env } from "cloudflare:workers";
import { describeError } from "../core/log";
import { RelayError, statusOf } from "../shared/errors";
import type { Env } from "../env";
import type { Principal } from "../services/principal";
import { requireActor } from "./actor";
import type { Need } from "./needs";
import { isSuspended } from "../shared/limits";

type ConsoleCtx = { env: Env; p: Principal; request: Request; params: Record<string, string> };

// The one session-auth and error path for console routes that answer a file instead of a server function.
// A GET that exports data sets refuseSuspended: it is no write, so it needs no same-origin check, but a suspended workspace is paused.
export function consoleRoute(what: string, need: Need & { refuseSuspended?: boolean }, handler: (ctx: ConsoleCtx) => Promise<Response>) {
  return async ({ request, params }: { request: Request; params: Record<string, string> }): Promise<Response> => {
    try {
      const p = await requireActor(env, request.headers, need);
      if (need.refuseSuspended && isSuspended(p.workspaceStatus)) throw new RelayError("workspace suspended");
      return await handler({ env, p, request, params });
    } catch (err) {
      const status = statusOf(err);
      if (status) return Response.json({ error: (err as Error).message }, { status });
      console.error(`console ${what} failed`, ...Object.values(params), describeError(err));
      return Response.json({ error: "internal error" }, { status: 500 });
    }
  };
}
