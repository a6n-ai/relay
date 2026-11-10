import { desc } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { EmptyState, PageShell } from "@foundry/design-system";
import { FilteredTeamTable } from "@/components/ds/filtered-tables";
import type { TeamListItem } from "@/components/ds/filtered-tables";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Team" };

export default async function AccountsPage() {
  const session = await getSession();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));

  const items: TeamListItem[] = rows.map((r) => {
    const name = r.name ?? "";
    return {
      publicId: r.publicId,
      email: r.email,
      name: name || "No name",
      role: r.role,
      status: r.status,
      createdLabel: new Date(r.createdAt).toLocaleDateString(),
      isYou: r.email === session?.user.email,
      searchText: `${r.email} ${name} ${r.role} ${r.status}`,
      filterKeys: [r.status],
    };
  });

  return (
    <PageShell>
      <ViewHeader
        icon={UsersIcon}
        title="Team"
        subtitle="People who can sign in to this console. New sign-ups are off; add people here."
      />
      {items.length === 0 ? (
        <EmptyState icon={UsersIcon} message="No teammates yet." />
      ) : (
        <FilteredTeamTable items={items} />
      )}
    </PageShell>
  );
}
