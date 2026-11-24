import { z } from "zod";

// Only .validator() calls use these. Top-level zod consts in .fns.ts survive the client compile and pull zod into the entry chunk.
export const id = z.string().min(1);
export const name = z.string().trim().min(1).max(80);
export const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/);
export const appId = z.string().min(1);
export const displayName = z.string().trim().max(80).optional();
export const role = z.enum(["owner", "admin", "member", "billing"]);
export const inviteInput = z.object({ email: z.string().trim().toLowerCase().email(), role });
