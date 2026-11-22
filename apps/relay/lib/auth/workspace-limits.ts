// Workspaces made by anyone other than a6n staff start small; Clients-page limits are set after creation.
export function selfServeLimits(
  platformRole: string | null,
): { maxApps: number; monthlyMessageQuota: number } | null {
  if (platformRole === "super_admin") return null;
  return { maxApps: 1, monthlyMessageQuota: 100 };
}
