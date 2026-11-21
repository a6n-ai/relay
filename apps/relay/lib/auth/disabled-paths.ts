// Org mutations run only through server actions (auth.api), never raw HTTP from the browser.
export const ORG_DISABLED_PATHS = [
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/update-member-role",
  "/organization/remove-member",
  "/organization/leave",
  "/organization/create-team",
  "/organization/update-team",
  "/organization/remove-team",
  "/organization/add-team-member",
  "/organization/remove-team-member",
  "/organization/update",
  "/organization/delete",
] as const;

// Admin-plugin endpoints are server-side only; direct auth.api calls skip disabledPaths.
export const ADMIN_DISABLED_PATHS = [
  "/admin/set-role",
  "/admin/create-user",
  "/admin/update-user",
  "/admin/list-user-sessions",
  "/admin/unban-user",
  "/admin/ban-user",
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/remove-user",
  "/admin/set-user-password",
  "/admin/has-permission",
  "/admin/get-user",
  "/admin/list-users",
] as const;
