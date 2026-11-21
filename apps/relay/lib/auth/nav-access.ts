import { NAV_GROUPS, TEAM_PERM, permKey, type Perm } from "@/components/ds/nav";
import { can } from "./guards";

/** Keys (`permKey`) of the nav permissions the caller holds. One `can` per distinct permission, in parallel. */
export async function navAccess(): Promise<Set<string>> {
  const perms = new Map<string, Perm>([[permKey(TEAM_PERM), TEAM_PERM]]);
  for (const item of NAV_GROUPS.flatMap((g) => g.items)) if (item.perm) perms.set(permKey(item.perm), item.perm);
  const granted = await Promise.all(
    [...perms].map(async ([key, perm]) => ((await can(perm)) ? key : null)),
  );
  return new Set(granted.filter((k): k is string => k !== null));
}
