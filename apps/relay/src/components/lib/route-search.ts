import { MESSAGE_STATUSES, type MessageStatus } from "../../shared/mail";

// Route `validateSearch` parsers: a garbage value is dropped rather than failing the page. The server validates again at the fn boundary.
export const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
export const appId = str;
export const cursor = str;
export const posInt = (v: unknown): number | undefined => (typeof v === "number" && v > 0 ? Math.floor(v) : undefined);
export const oneOf = <T extends string>(allowed: readonly T[], v: unknown): T | undefined => allowed.find((a) => a === v);
export const status = (v: unknown): MessageStatus | undefined => oneOf(MESSAGE_STATUSES, v);

// TanStack types `search`, `params` and `to` per route; links built from data (a row action, a filter's next search, a switcher) cannot name the route, so the one cast lives here.
export const untyped = (value: unknown): never => value as never;
