import { useRouteContext } from "@tanstack/react-router";
import { allows, type Permission } from "../../shared/permissions";
import { isSuspended } from "../../shared/limits";

// Hides write controls for read-only roles and for every write in a suspended workspace. The server still refuses; this only keeps the screen honest.
export function useCan(permission: Permission): boolean {
  const { shell } = useRouteContext({ from: "/_app" });
  if (!shell.active || isSuspended(shell.active.status)) return false;
  return allows(shell.active.roles, permission);
}
