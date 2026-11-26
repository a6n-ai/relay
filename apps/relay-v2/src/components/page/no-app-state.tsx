import { Link } from "@tanstack/react-router";
import { Button } from "@foundry/ui/button";
import { MailIcon } from "lucide-react";
import { type Crumb, PageHeader } from "../shell/page-header";
import { EmptyState } from "./empty-state";

// A create page for something that belongs to an app, opened before any app exists.
export function NoAppState({ crumbs, what }: { crumbs: Crumb[]; what: string }) {
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <EmptyState
        icon={MailIcon}
        title="Create an app first"
        description={`${what} belong to an app.`}
        action={
          <Button variant="outline" render={<Link to="/apps/new" />}>
            New app
          </Button>
        }
      />
    </>
  );
}
