import { orgRoles } from "./permissions";

type Actor = { memberId: string; roles: string[] };
type Target = { memberId: string; roles: string[]; status: string };

export function parseRoles(role: string): string[] {
  return [...new Set(role.split(",").map((r) => r.trim()).filter(Boolean))];
}

export function checkRoleChange(input: {
  actor: Actor;
  target: Target;
  next: string[];
  activeOwnerCount: number;
}): string | null {
  const { actor, target, next, activeOwnerCount } = input;
  if (actor.memberId === target.memberId) return "You can’t change your own roles";
  if (next.length === 0) return "Pick at least one role";
  const known = Object.keys(orgRoles);
  if (next.some((r) => !known.includes(r))) return "Unknown role";
  const wasOwner = target.roles.includes("owner");
  const willBeOwner = next.includes("owner");
  if (wasOwner !== willBeOwner && !actor.roles.includes("owner")) {
    return "Only an owner can add or remove the owner role";
  }
  if (wasOwner && !willBeOwner && target.status === "active" && activeOwnerCount <= 1) {
    return "A workspace needs at least one owner";
  }
  return null;
}

export function checkSuspendOrRemove(input: {
  actor: Actor;
  target: Target;
  activeOwnerCount: number;
  action: "suspend" | "remove";
}): string | null {
  const { actor, target, activeOwnerCount, action } = input;
  if (actor.memberId === target.memberId) {
    return action === "suspend" ? "You can’t suspend yourself" : "You can’t remove yourself";
  }
  const targetIsOwner = target.roles.includes("owner");
  if (targetIsOwner && !actor.roles.includes("owner")) {
    return "Only an owner can suspend or remove an owner";
  }
  if (targetIsOwner && target.status === "active" && activeOwnerCount <= 1) {
    return "A workspace needs at least one owner";
  }
  return null;
}
