import { createFileRoute } from "@tanstack/react-router";
import { CampaignEditor } from "../../components/campaigns/campaign-editor";
import { CampaignReport } from "../../components/campaigns/campaign-report";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { isNotFound } from "../../components/lib/scoped-load";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/status-badge";
import { fetchAudienceHook } from "../../console/apps.fns";
import { fetchCampaign, fetchCampaignOptions, fetchCampaignStats } from "../../console/campaigns.fns";
import { DetailSkeleton } from "../../components/page/page-skeleton";
import { str } from "../../components/lib/route-search";

type CampaignSearch = { appId?: string };

export const Route = createFileRoute("/_app/campaigns_/$campaignId")({
  validateSearch: (search: Record<string, unknown>): CampaignSearch => ({
    appId: str(search.appId),
  }),
  loader: async ({ params }) => {
    const campaign = await fetchCampaign({ data: { id: params.campaignId } }).catch((err) => {
      if (isNotFound(err)) return { missing: true as const };
      throw err;
    });
    if (!campaign) return null;
    if ("missing" in campaign) return campaign;
    if (campaign.status !== "draft") {
      const stats = await fetchCampaignStats({ data: { id: params.campaignId } });
      if (!stats) return null;
      return { campaign, stats };
    }
    const [options, hook] = await Promise.all([
      fetchCampaignOptions({ data: { appId: campaign.appId } }),
      fetchAudienceHook({ data: { appId: campaign.appId } }),
    ]);
    if (!options) return null;
    return { campaign, options, hookReady: hook?.enabled === true };
  },
  pendingComponent: () => <DetailSkeleton crumbs={[{ label: "Campaigns", to: "/campaigns" }, { label: "Campaign" }]} />,
  component: CampaignPage,
});

function CampaignPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const { shell } = Route.useRouteContext();
  if (!page) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Campaigns", to: "/campaigns", search: { appId: search.appId } }, { label: "Campaign" }]} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Campaigns", to: "/campaigns", search: { appId: search.appId } }, { label: "Campaign" }]} />
        <DeniedState reason="not-found" label="Campaign not found" />
      </>
    );
  }
  const { campaign } = page;
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Campaigns", to: "/campaigns", search: { appId: search.appId } }, { label: campaign.name }]}
        badge={<StatusBadge status={campaign.status} />}
      />
      {page.stats ? (
        <CampaignReport campaign={campaign} stats={page.stats} />
      ) : (
        <CampaignEditor
          campaign={campaign}
          options={page.options}
          hookReady={page.hookReady}
          appName={shell.apps.find((a) => a.id === campaign.appId)?.name ?? "—"}
        />
      )}
    </>
  );
}
