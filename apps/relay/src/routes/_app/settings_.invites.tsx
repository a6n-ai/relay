import { createFileRoute, redirect } from "@tanstack/react-router";

// Invites live in the Members list now; old links and bookmarks land there.
export const Route = createFileRoute("/_app/settings_/invites")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/members", replace: true });
  },
});
