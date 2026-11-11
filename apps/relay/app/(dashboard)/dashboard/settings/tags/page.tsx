import { PageShell } from "@foundry/design-system";
import { CreateDialog } from "@/components/ds/create-dialog";
import { SettingsPage } from "@/components/ds/settings";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-table";
import { resolveActiveApp } from "@/lib/apps/active-app";
import { appMessageTagsService } from "@/lib/services/mailbox-tags.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { AppTagsBoard } from "./app-tags-board";
import { CreateAppTagForm } from "./create-app-tag-form";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tags" };

export default async function TagsSettingsPage() {
  const [activeApp, { items: allApps }] = await Promise.all([
    resolveActiveApp(),
    tenantsService.listRecent(),
  ]);
  const apps = activeApp ? allApps.filter((a) => a.id === activeApp.id) : allApps;
  const tags = activeApp
    ? await appMessageTagsService.forTenant(activeApp.id)
    : (await appMessageTagsService.listRecentAll());
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

  const appChoices = apps.map((a) => ({ publicId: a.publicId, name: a.name }));
  const create = (pill: boolean) => (
    <CreateDialog
      label="New tag"
      description={
        activeApp
          ? `Tags apply to every message for ${activeApp.name}.`
          : "Pick the app. The tag applies to all of its messages."
      }
      pill={pill}
    >
      <CreateAppTagForm apps={appChoices} />
    </CreateDialog>
  );

  return (
    <PageShell>
      <ViewHeader title="Tags" section="settings" actions={apps.length > 0 ? create(false) : undefined} />
      <SettingsPage
        title="Tags"
        subtitle={
          activeApp
            ? `Tags for ${activeApp.name}. Switch apps in the sidebar to manage another.`
            : "A tag on an app marks every message for that app, mail now and WhatsApp later."
        }
      >
        <AppTagsBoard items={items} filters={filters} emptyAction={apps.length > 0 ? create(true) : undefined} />
      </SettingsPage>
    </PageShell>
  );
}
