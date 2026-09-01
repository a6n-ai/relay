import { InboxIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
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
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.publicId} className="rounded-md border p-3 text-sm">
            <span className="font-medium">{r.event}</span> · {r.channel} · {r.locale}
          </li>
        ))}
        {rows.length === 0 ? <li className="text-muted-foreground">No templates yet.</li> : null}
      </ul>
    </PageShell>
  );
}
