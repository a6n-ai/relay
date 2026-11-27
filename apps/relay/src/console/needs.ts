// Client-safe: server-fn files use these at module level, so they must not pull guard.ts (and cloudflare:workers) into the client bundle.
export type Need = { permission?: Record<string, string[]>; write?: boolean };

export const READ = (resource: string, ...actions: string[]): Need => ({ permission: { [resource]: actions } });
export const WRITE = (resource: string, ...actions: string[]): Need => ({ permission: { [resource]: actions }, write: true });
