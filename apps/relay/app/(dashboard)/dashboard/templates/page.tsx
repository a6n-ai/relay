import { FileTextIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { CreateDialog } from "@/components/ds/create-dialog";
import { EmptyState } from "@/components/ds/empty-state";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { displayChannel } from "@/components/ds/plain-labels";
import { templatesService } from "@/lib/services/templates.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { CreateTemplateForm } from "./create-template-form";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Templates" };

const TEMPLATE_FILTERS: ListingFilter[] = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "in_app", label: "In the app" },
  { id: "off", label: "Off" },
];

export default async function TemplatesPage() {
  const [{ items: tenantRows }, { items: rows }] = await Promise.all([
    tenantsService.listRecent(),
    templatesService.listRecent(),
  ]);

  const tenantById = new Map(tenantRows.map((t) => [t.id, t]));
  const items: ListingRow[] = rows.map((r) => {
    const tenant = tenantById.get(r.tenantId);
    const channel = displayChannel(r.channel);
    const meta = tenant?.name ?? "App";
    const filterKeys = [r.channel, ...(r.enabled ? [] : ["off"])];
    return {
      id: r.publicId,
      title: r.event,
      meta,
      searchText: `${r.event} ${meta} ${channel} ${r.locale}`,
      filterKeys,
      badges: [
        { label: channel, variant: "outline" },
        { label: r.locale, variant: "secondary" },
        ...(r.enabled ? [] : [{ label: "Off", variant: "destructive" as const }]),
      ],
    };
  });

  const create = (pill: boolean) => (
    <CreateDialog label="New template" pill={pill}>
      <CreateTemplateForm tenants={tenantRows} />
    </CreateDialog>
  );

  return (
    <PageShell>
      <ViewHeader
        title="Templates"
        subtitle="Reusable email for a specific moment, like “order shipped.” The app uses the same name when it asks Relay to send."
        section="campaigns"
        actions={create(false)}
      />
      <FilteredResourceList
        title="Saved templates"
        empty={
          <EmptyState
            icon={FileTextIcon}
            title="No templates yet"
            lines={["A template is the email an app sends for one moment, like “order shipped.”", "Write it once and reuse it."]}
            action={create(true)}
            docsHref="/docs"
          />
        }
        searchPlaceholder="Search templates"
        filters={TEMPLATE_FILTERS}
        items={items}
      />
    </PageShell>
  );
}
