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
