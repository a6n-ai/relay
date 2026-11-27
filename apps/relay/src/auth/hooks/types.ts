import type { createAuthMiddleware } from "better-auth/api";

export type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

// Set by the account-create hook, read by the callback after-hook of the same request (createAuth runs once per request).
export type AdminLinkState = { refused: boolean };
