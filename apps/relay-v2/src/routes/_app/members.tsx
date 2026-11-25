import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/members")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/members" });
  },
});
