"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRightIcon, CloudSunIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Card, CardContent } from "@foundry/ui/card";

function greetingForHour(hour: number): { label: string; Icon: typeof SunIcon } {
  if (hour < 5 || hour >= 21) return { label: "Good night", Icon: MoonIcon };
  if (hour < 12) return { label: "Good morning", Icon: SunIcon };
  if (hour < 17) return { label: "Good afternoon", Icon: CloudSunIcon };
  return { label: "Good evening", Icon: MoonIcon };
}

/** Report banner — Shell 03 left hero, Relay copy + geometric mark (not stock art). */
export function OverviewGreeting({ name }: { name: string }) {
  const { label, Icon } = useMemo(() => greetingForHour(new Date().getHours()), []);
  return (
    <Card className="h-full gap-0 py-0">
      <CardContent className="flex h-full min-h-44 items-stretch gap-4 p-6">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {label}, {name}
              <Icon className="text-muted-foreground" />
            </h1>
            <p className="max-w-md text-sm font-normal text-muted-foreground">
              Stay informed with today’s delivery analytics. Outbox, channels, and tenant volume
              on one canvas.
            </p>
          </div>
          <Button size="sm" className="w-fit" asChild>
            <Link href="/dashboard/logs">
              View full report
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
        <SignalMark />
      </CardContent>
    </Card>
  );
}

function SignalMark() {
  return (
    <svg
      viewBox="0 0 160 120"
      className="hidden w-40 shrink-0 self-center text-muted-foreground md:block"
      aria-hidden
    >
      <rect x="18" y="78" width="124" height="8" fill="currentColor" opacity="0.2" />
      <rect x="48" y="42" width="64" height="40" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="56" y="50" width="10" height="24" fill="var(--chart-1)" />
      <rect x="70" y="58" width="10" height="16" fill="var(--chart-2)" />
      <rect x="84" y="46" width="10" height="28" fill="var(--chart-3)" />
      <rect x="98" y="54" width="10" height="20" fill="var(--chart-4)" />
      <rect x="72" y="86" width="16" height="4" fill="currentColor" opacity="0.35" />
    </svg>
  );
}
