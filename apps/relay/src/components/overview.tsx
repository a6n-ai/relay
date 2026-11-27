import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { Link } from "@tanstack/react-router";
import type { fetchOverview } from "../console/overview.fns";
import { DeniedState, deniedReason } from "./denied-state";
import { MeterBar } from "./meter-bar";
import { Hint, SectionTitle } from "./page/text";
import { createItems } from "./shell/nav";
import { PageHeader } from "./shell/page-header";
import { StatTile } from "./stat-tile";
import { type Shell } from "../shared/views";

type OverviewData = NonNullable<Awaited<ReturnType<typeof fetchOverview>>>;

function GetStarted({ shell }: { shell: Shell }) {
  const rows = createItems(shell.active?.roles ?? [], shell.active?.status === "suspended").flatMap((c) => (c.start ? [{ ...c, ...c.start }] : []));
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
              <SectionTitle as="p">{r.title}</SectionTitle>
              <Hint>{r.line}</Hint>
            </div>
            <Button variant="outline" render={<Link to={r.to} search={(r.new ? { new: r.new } : undefined) as never} />}>
              {r.cta}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const fmt = (n: number) => n.toLocaleString("en-CA");

export default function Overview({ overview, shell }: { overview: OverviewData | null; shell: Shell }) {
  if (!overview) {
    return (
      <>
        <PageHeader />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }

  const { month, quota, sent, delivered, bounced, inbound, days } = overview;
  const busiest = Math.max(1, ...days.map((d) => d.sent));
  return (
    <>
      <PageHeader />
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
