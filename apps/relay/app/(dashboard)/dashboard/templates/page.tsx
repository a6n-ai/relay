import { InboxIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const rows = await db.select().from(notificationTables.notificationTemplate);

  return (
    <PageShell>
      <PageHeader
        icon={InboxIcon}
        title="Templates"
        subtitle="Per-tenant templates. Transactional sends also accept inline title/body when no template exists."
      />
      {rows.length === 0 ? (
        <EmptyState icon={InboxIcon} message="No templates yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <SectionCard key={r.publicId} title={r.event} variant="flat">
              <div className="flex gap-2">
                <Badge variant="outline">{r.channel}</Badge>
                <Badge variant="secondary">{r.locale}</Badge>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
