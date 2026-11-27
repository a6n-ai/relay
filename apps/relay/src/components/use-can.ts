import { useRouteContext } from "@tanstack/react-router";
import { allows } from "../lib/auth/permissions";

// Hides write controls for read-only roles and for every write in a suspended workspace. The server still refuses; this only keeps the screen honest.
export function useCan(permission: Record<string, string[]>): boolean {
  const { shell } = useRouteContext({ from: "/_app" });
  if (!shell.active || shell.active.status === "suspended") return false;
  return allows(shell.active.roles, permission);
}
