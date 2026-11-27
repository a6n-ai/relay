import type { ActionOf, Permission, Resource } from "../shared/permissions";

// Client-safe: server-fn files use these at module level, so they must not pull guard.ts (and cloudflare:workers) into the client bundle.
export type Need = { permission?: Permission; write?: boolean };

export const READ = <R extends Resource>(resource: R, action: ActionOf<R>): Need => ({ permission: { [resource]: [action] } });
export const WRITE = <R extends Resource>(resource: R, action: ActionOf<R>): Need => ({
  permission: { [resource]: [action] },
  write: true,
});
