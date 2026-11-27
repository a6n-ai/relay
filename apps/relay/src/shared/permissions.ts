import type { OrgRole } from "./roles";

const OA = ["owner", "admin"] as const;
const OAM = ["owner", "admin", "member"] as const;
const OAB = ["owner", "admin", "billing"] as const;
const ALL = ["owner", "admin", "member", "billing"] as const;

// The one table: resource -> action -> workspace roles that hold it. auth/permissions.ts builds better-auth's roles from it.
export const ORG_PERMISSIONS = {
  organization: { update: OA, delete: ["owner"] },
  member: { create: OA, update: OA, delete: OA },
  invitation: { create: OA, cancel: OA },
  team: { create: OA, update: OA, delete: OA },
  ac: { create: OA, read: OAM, update: OA, delete: OA },
  tenant: { read: ALL, write: OA },
  sending: { read: OAM, write: OA },
  mailbox: { read: OAM, send: OAM, manage: OA },
  campaign: { read: OAM, write: OA, send: OA },
  list: { read: OAM, write: OA, import: OA },
  template: { read: OAM, write: OA },
  webhook: { read: OAM, write: OA, log_all: OA },
  log: { read: ALL },
  settings: { read: OAM, write: OA },
  workspace: { usage: OAB, limits: OAB },
  staff: { read: OAM },
} as const satisfies Record<string, Record<string, readonly OrgRole[]>>;

// What only the platform admin holds; no workspace role does.
export const PLATFORM_PERMISSIONS = {
  settings: ["read", "write"],
  audit: ["read"],
  tenant: ["read", "write"],
  message: ["read", "write"],
  sending: ["read", "write"],
  domain: ["delete_protected"],
} as const;

export type Resource = keyof typeof ORG_PERMISSIONS;
export type ActionOf<R extends Resource> = keyof (typeof ORG_PERMISSIONS)[R] & string;
export type Permission = { [R in Resource]?: readonly ActionOf<R>[] };

const holds = (role: OrgRole, need: Permission): boolean =>
  (Object.entries(need) as [Resource, readonly string[]][]).every(([resource, actions]) => {
    const table: Record<string, readonly OrgRole[]> = ORG_PERMISSIONS[resource] ?? {};
    return actions.every((a) => table[a]?.includes(role));
  });

// No better-auth import, so the client nav, useCan and the server guard all answer the same way.
export const allows = (roles: readonly OrgRole[], need: Permission): boolean => roles.some((r) => holds(r, need));
