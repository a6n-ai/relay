import { setResponseStatus, getRequestHeaders } from "@tanstack/react-start/server";
import { AppError } from "@foundry/commons/errors";
import { createGuard } from "@foundry/commons/guard";
import { env } from "cloudflare:workers";
import { recordFailure } from "../core/log";
import { requireActor, requirePlatformAdmin } from "./actor";
import type { ConsoleActor } from "../core/session";
import type { Need } from "./needs";

// A known error keeps its status and message, anything else is a 500 with no detail. The browser sees only that copy;
// the log middleware in src/start.ts writes the status and the real cause.
const shared = {
  setStatus: setResponseStatus,
  onFailure: (sent: Error, status: number, cause: unknown) => {
    recordFailure(sent, status, cause);
  },
};

const guard = createGuard<Need, ConsoleActor>({ actor: (need) => requireActor(env, getRequestHeaders(), need), ...shared });
export const { run, read } = guard;

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
  <T>(fn: (actor: ConsoleActor) => Promise<T>) =>
  async (actor: ConsoleActor): Promise<T | { missing: true }> => {
    try {
      return await fn(actor);
    } catch (err) {
      if (err instanceof AppError && err.status === 404) return { missing: true as const };
      throw err;
    }
  };
