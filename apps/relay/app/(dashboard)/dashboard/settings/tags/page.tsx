import { TagsIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { OperatorSplit } from "@/components/ds/operator-split";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { appMessageTagsService } from "@/lib/services/mailbox-tags.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { AppTagsBoard } from "./app-tags-board";
import { CreateAppTagForm } from "./create-app-tag-form";

export const dynamic = "force-dynamic";

export default async function TagsSettingsPage() {
  const [{ items: apps }, tags] = await Promise.all([
    tenantsService.listRecent(),
    appMessageTagsService.listRecentAll(),
  ]);
  const appById = new Map(apps.map((a) => [a.id, a]));
  const filters: ListingFilter[] = apps.map((a) => ({ id: a.publicId, label: a.name }));
  const items: Array<ListingRow & { tenantPublicId: string; slug: string }> = [];
  for (const tag of tags) {
    const app = appById.get(tag.tenantId);
    if (!app) continue;
    items.push({
      id: tag.publicId,
      title: tag.label,
      meta: app.name,
      searchText: `${tag.label} ${app.name} ${tag.slug}`,
      filterKeys: [app.publicId],
      tenantPublicId: app.publicId,
      slug: tag.slug,
    });
  }

  return (
    <PageShell>
      <PageHeader
        icon={TagsIcon}
        title="Tags"
        subtitle="A tag on an app marks every message for that app — mail now, WhatsApp later."
      />
      <OperatorSplit
        create={
          <SectionCard title="Add a tag" subtitle="Pick the app. The tag applies to all of its messages.">
            <CreateAppTagForm apps={apps.map((a) => ({ publicId: a.publicId, name: a.name }))} />
          </SectionCard>
        }
        list={<AppTagsBoard items={items} filters={filters} />}
      />
    </PageShell>
  );
}
