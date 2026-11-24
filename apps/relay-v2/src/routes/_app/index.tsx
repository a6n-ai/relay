import { createFileRoute } from "@tanstack/react-router";
import { ViewHeader } from "../../components/view-header";

export const Route = createFileRoute("/_app/")({
  component: Overview,
});

// Placeholder until the overview screen lands.
function Overview() {
  return <ViewHeader title="Overview" />;
}
