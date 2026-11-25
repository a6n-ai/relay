import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import Globe from "lucide-react/icons/globe";
import LayoutGrid from "lucide-react/icons/layout-grid";
import UserPlus from "lucide-react/icons/user-plus";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { MeterBar } from "../../components/meter-bar";
import { createItems } from "../../components/shell/nav";
import { PageHeader } from "../../components/shell/page-header";
import { StatTile } from "../../components/stat-tile";
import { fetchOverview } from "../../console/overview.fns";

export const Route = createFileRoute("/_app/")({
  loader: () => fetchOverview(),
  component: Overview,
});

const START = [
  { id: "app", icon: LayoutGrid, title: "Create an app", line: "An app groups the messages, lists and campaigns you send.", cta: "Create", to: "/apps" },
  { id: "domain", icon: Globe, title: "Add a domain", line: "Verify a domain to send from your own address.", cta: "Add", to: "/domains" },
  { id: "invite", icon: UserPlus, title: "Invite your team", line: "Give teammates access to this workspace.", cta: "Invite", to: "/settings/invites" },
] as const;

function GetStarted({ shell }: { shell: NonNullable<ReturnType<typeof Route.useRouteContext>["shell"]> }) {
  const allowed = new Set(createItems(shell.active?.roles ?? [], shell.active?.status === "suspended").map((c) => c.id));
  const rows = START.filter((r) => allowed.has(r.id));
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Get started</CardTitle>
      </CardHeader>
      <CardContent className="grid divide-y">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <r.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-sm text-muted-foreground">{r.line}</p>
            </div>
            <Button size="sm" className="rounded-full" render={<Link to={r.to as string} search={{ new: 1 } as never} />}>
              {r.cta}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const fmt = (n: number) => n.toLocaleString("en-CA");

function Overview() {
  const overview = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  if (!overview) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Overview" }]} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }

  const { month, quota, sent, delivered, bounced, inbound, days } = overview;
  const busiest = Math.max(1, ...days.map((d) => d.sent));
  return (
    <>
      <PageHeader crumbs={[{ label: "Overview" }]} />
      <div className="grid gap-4 p-4">
        {shell.apps.length === 0 ? (
          <GetStarted shell={shell} />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Sent" value={fmt(sent)} />
            <StatTile label="Delivered" value={fmt(delivered)} />
            <StatTile label="Bounced" value={fmt(bounced)} />
            <StatTile label="Received" value={fmt(inbound)} />
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>{month} usage</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {quota === 0 ? (
              <p className="text-sm tabular-nums">{fmt(sent)} sent, unlimited</p>
            ) : (
              <div className="flex items-center gap-3">
                <MeterBar percent={(sent / quota) * 100} />
                <p className="text-sm tabular-nums">
                  {fmt(sent)} of {fmt(quota)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        {days.length > 0 ? (
          <Card>
            <CardContent className="grid gap-2">
              {days.map((d) => (
                <div key={d.day} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{d.day}</span>
                  <MeterBar percent={(d.sent / busiest) * 100} />
                  <span className="w-12 text-right tabular-nums">{fmt(d.sent)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
