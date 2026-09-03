import { InboxIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { OperatorSplit } from "@/components/ds/operator-split";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { displayChannel } from "@/components/ds/plain-labels";
import { templatesService } from "@/lib/services/templates.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { CreateTemplateForm } from "./create-template-form";

export const dynamic = "force-dynamic";

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

  return (
    <PageShell>
      <PageHeader
        icon={InboxIcon}
        title="Templates"
        subtitle="Reusable email for a specific moment, like “order shipped.” The app uses the same name when it asks Relay to send."
      />
      <OperatorSplit
        create={
          <SectionCard title="New email template">
            <CreateTemplateForm tenants={tenantRows} />
          </SectionCard>
        }
        list={
          <FilteredResourceList
            title="Saved templates"
            glyph="inbox"
            emptyMessage="No templates yet. Write one on the left."
            searchPlaceholder="Search templates"
            filters={TEMPLATE_FILTERS}
            items={items}
          />
        }
      />
    </PageShell>
  );
}
