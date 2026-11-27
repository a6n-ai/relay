import { setResponseStatus, getRequestHeaders } from "@tanstack/react-start/server";
import { AppError } from "@foundry/commons/errors";
import { createGuard } from "@foundry/commons/guard";
import { env } from "cloudflare:workers";
import { recordFailure } from "../core/log";
import { requireActor } from "./actor";
import type { ConsoleActor } from "../core/session";

export type Need = { permission?: Record<string, string[]>; write?: boolean };

// A known error keeps its status and message, anything else is a 500 with no detail. The browser sees only that copy;
// the log middleware in src/start.ts writes the status and the real cause.
const guard = createGuard<Need, ConsoleActor>({
  actor: (need) => requireActor(env, getRequestHeaders(), need),
  setStatus: setResponseStatus,
  onFailure: (sent, status, cause) => {
    recordFailure(sent, status, cause);
  },
});

export const { run, read } = guard;

export const READ = (resource: string, ...actions: string[]): Need => ({ permission: { [resource]: actions } });
export const WRITE = (resource: string, ...actions: string[]): Need => ({ permission: { [resource]: actions }, write: true });

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
