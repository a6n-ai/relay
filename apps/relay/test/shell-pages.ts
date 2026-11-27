import type { PageData } from "../src/components/shell/page-data";

// Stands in for the routes' `staticData` (route files cannot load outside the Worker build).
const pages: Record<string, PageData> = {
  "/": { title: "Overview" },
  "/messages": { title: "Messages", scoped: "all" },
  "/messages/failures": { title: "Failed" },
  "/messages/suppressions": { title: "Suppressed" },
  "/campaigns": { title: "Campaigns", scoped: "first" },
  "/campaigns/templates": { title: "Templates", scoped: "first" },
  "/campaigns/automations": { title: "Automations", scoped: "first" },
  "/lists": { title: "Lists", scoped: "all" },
  "/apps": { title: "Apps" },
  "/domains": { title: "Domains" },
  "/settings": { title: "Settings" },
  "/settings/members": { title: "Members" },
  "/settings/invites": { title: "Invites" },
  "/settings/teams": { title: "Teams" },
  "/admin": { title: "Admin" },
};

export const pageOf = (to: string) => pages[to];
