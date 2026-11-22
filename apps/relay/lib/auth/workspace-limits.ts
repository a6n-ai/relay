// Workspaces made by anyone other than a6n staff start small; Clients-page limits are set after creation.
const SELF_SERVE_WORKSPACE_CAP = 3;

export function canCreateSelfServeWorkspace(platformRole: string | null, ownedSelfServeCount: number): boolean {
  if (platformRole === "super_admin") return true;
  return ownedSelfServeCount < SELF_SERVE_WORKSPACE_CAP;
}

export function selfServeLimits(
  platformRole: string | null,
): { maxApps: number; monthlyMessageQuota: number } | null {
  if (platformRole === "super_admin") return null;
  return { maxApps: 1, monthlyMessageQuota: 100 };
}
