import { orgRoles, PERMISSION_LABELS, ROLE_LABELS } from "./permissions";

/** What each code-defined workspace role allows, in plain labels. Resources without a label (e.g. Better Auth internals) are skipped. */
export function roleSummary() {
  return (Object.keys(orgRoles) as (keyof typeof orgRoles)[]).map((key) => {
    const statements: Record<string, readonly string[]> = orgRoles[key].statements;
    const allows = PERMISSION_LABELS.flatMap(({ resource, label, actions }) => {
      const held = statements[resource] ?? [];
      const labels = actions.filter((a) => held.includes(a.action)).map((a) => a.label);
      return labels.length > 0 ? [{ resource, label, actions: labels }] : [];
    });
    return { key, label: ROLE_LABELS[key].label, description: ROLE_LABELS[key].description, allows };
  });
}
