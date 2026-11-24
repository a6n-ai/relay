import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { createFileRoute } from "@tanstack/react-router";
import { MeterBar } from "../../components/meter-bar";
import { StatTile } from "../../components/stat-tile";
import { ViewHeader } from "../../components/view-header";
import { fetchOverview } from "../../console/overview.fns";

export const Route = createFileRoute("/_app/")({
  loader: () => fetchOverview(),
  component: Overview,
});

const fmt = (n: number) => n.toLocaleString("en-CA");

function Overview() {
  const overview = Route.useLoaderData();
  if (!overview) {
    return (
      <>
        <ViewHeader title="Overview" />
        <p className="p-4 text-sm text-muted-foreground">Usage is shown to workspace owners, admins and billing.</p>
      </>
    );
  }

  const { month, quota, sent, delivered, bounced, inbound, days } = overview;
  const busiest = Math.max(1, ...days.map((d) => d.sent));
  return (
    <>
      <ViewHeader title="Overview" />
      <div className="grid gap-4 p-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Sent" value={fmt(sent)} />
          <StatTile label="Delivered" value={fmt(delivered)} />
          <StatTile label="Bounced" value={fmt(bounced)} />
          <StatTile label="Received" value={fmt(inbound)} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{month} usage</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {quota === 0 ? (
              <p className="text-sm text-muted-foreground">Unlimited</p>
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
