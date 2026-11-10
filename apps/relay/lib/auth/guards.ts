import { Role } from "@foundry/commons";
import { createPermissionGuards, createRoleGuards } from "@foundry/auth";
import { getFreshSession } from "./session";
import { roles } from "./permissions";

const { requireRole } = createRoleGuards(getFreshSession);
const { requirePermission } = createPermissionGuards(getFreshSession, roles);

export { requireRole, requirePermission };

export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}
