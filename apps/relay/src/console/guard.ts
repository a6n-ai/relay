import { setResponseStatus, getRequestHeaders } from "@tanstack/react-start/server";
import { AppError } from "@foundry/commons/errors";
import { createGuard } from "@foundry/commons/guard";
import { env } from "cloudflare:workers";
import { recordFailure } from "../core/log";
import { statusOf } from "../shared/errors";
import { requireActor, requirePlatformAdmin } from "./actor";
import type { Principal } from "../services/principal";
import type { Need } from "./needs";

// A known error keeps its status and message, anything else is a 500 with no detail. The browser sees only that copy;
// the log middleware in src/start.ts writes the status and the real cause.
const shared = {
  setStatus: setResponseStatus,
  onFailure: (sent: Error, status: number, cause: unknown) => {
    recordFailure(sent, status, cause);
  },
};

const guard = createGuard<Need, Principal>({ actor: (need) => requireActor(env, getRequestHeaders(), need), ...shared });

// A ClientDO refusal crosses RPC as a plain Error whose message is its code. The guard keeps only an AppError's status, so it becomes one here.
const withStatus =
  <T>(fn: (p: Principal) => Promise<T>) =>
  async (p: Principal): Promise<T> => {
    try {
      return await fn(p);
    } catch (err) {
      const status = err instanceof AppError ? undefined : statusOf(err);
      if (status) throw new AppError((err as Error).message, status);
      throw err;
    }
  };
export const run = <T>(need: Need, fn: (p: Principal) => Promise<T>) => guard.run(need, withStatus(fn));
export const read = <T>(need: Need, fn: (p: Principal) => Promise<T>) => guard.read(need, withStatus(fn));

const admin = createGuard<{ write?: boolean }, { userId: string }>({
  actor: (need) => requirePlatformAdmin(env, getRequestHeaders(), need),
  ...shared,
});
export const runAdmin = <T>(fn: (admin: { userId: string }) => Promise<T>, write = true) => admin.run({ write }, fn);

// Functions that check the session themselves (sign-in state, workspace create, password) still share the error copy and logging.
export function fail(err: unknown): never {
  return guard.fail(err);
}


// A page that can name a missing app or list renders its own empty state, so a 404 is data rather than an error.
export const orMissing =
  <T>(fn: (p: Principal) => Promise<T>) =>
  async (p: Principal): Promise<T | { missing: true }> => {
    try {
      return await fn(p);
    } catch (err) {
      if (statusOf(err) === 404) return { missing: true as const };
      throw err;
    }
  };
