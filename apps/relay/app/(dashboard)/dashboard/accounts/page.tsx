import { desc } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { EmptyState } from "@/components/ds/empty-state";
import { SettingsPage, SettingsRow, SettingsSection } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Team" };

type UserStatus = "active" | "inactive" | "suspended" | "deleted";

function statusBadge(status: UserStatus) {
  switch (status) {
    case "active":
      return <Badge variant="secondary">Active</Badge>;
    case "inactive":
      return <Badge variant="outline">Inactive</Badge>;
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>;
    case "deleted":
      return <Badge variant="destructive">Deleted</Badge>;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export default async function AccountsPage() {
  const session = await getSession();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));

  return (
    <PageShell>
      <ViewHeader title="Team" section="settings" />
      <SettingsPage title="Team" subtitle="People who can sign in to this console. New sign-ups are off; add people here.">
        {rows.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No teammates yet"
            lines={["People you add can sign in to this console.", "New sign-ups are off."]}
            docsHref="/docs"
          />
        ) : (
          <SettingsSection title="People who can sign in" description={`${rows.length.toLocaleString("en")} in total`}>
            {rows.map((r) => (
              <SettingsRow
                key={r.publicId}
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    {r.name || r.email}
                    {r.email === session?.user.email ? <Badge variant="outline">You</Badge> : null}
                  </span>
                }
                description={`${r.name ? `${r.email} · ` : ""}${r.role} · added ${new Date(r.createdAt).toLocaleDateString()}`}
              >
                {statusBadge(r.status)}
              </SettingsRow>
            ))}
          </SettingsSection>
        )}
      </SettingsPage>
    </PageShell>
  );
}
