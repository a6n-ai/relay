import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRightIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Card, CardContent } from "@foundry/ui/card";
import { cn } from "@foundry/ui/cn";

export type KpiItem = {
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  delta?: string;
  tone?: "ok" | "bad" | "neutral";
};

function badgeClass(tone: KpiItem["tone"]): string {
  switch (tone) {
    case "ok":
      return "bg-chart-2/10 text-chart-2";
    case "bad":
      return "bg-destructive/10 text-destructive";
    case "neutral":
    case undefined:
      return "bg-muted text-muted-foreground";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

/** Shell 03 action card — own rectangle, icon, figure, statistics link. */
export function KpiActionCard({ item }: { item: KpiItem }) {
  const Icon = item.icon;
  return (
    <Card className="h-full gap-0 py-0">
      <CardContent className="flex h-full flex-col justify-between gap-4 px-6 py-6">
        <div className="flex w-full items-start justify-between gap-3">
          <p className="text-sm font-normal">{item.label}</p>
          <Button variant="outline" size="icon" className="pointer-events-none size-8">
            <Icon />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <h3 className="nums text-2xl font-semibold">{item.value.toLocaleString()}</h3>
          {item.delta ? <Badge className={badgeClass(item.tone)}>{item.delta}</Badge> : null}
        </div>
        <Button variant="outline" className="w-fit" asChild>
          <Link href={item.href}>
            See statistics
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Card 01 product-card: one rectangle, hairline columns, Foundry primitives. */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  const col =
    items.length === 3 ? "lg:col-span-4" : items.length === 4 ? "lg:col-span-3" : "lg:col-span-6";

  return (
    <Card className="h-full gap-0 py-0">
      <CardContent className="grid grid-cols-12 p-0">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={cn(
                "col-span-12 flex flex-col justify-between gap-4 border-border px-6 py-6",
                "max-md:border-b lg:border-e last:border-0",
                col,
              )}
            >
              <div className="flex w-full items-start justify-between gap-3">
                <p className="text-sm font-normal">{item.label}</p>
                <Button variant="outline" size="icon" className="pointer-events-none size-8">
                  <Icon />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <h3 className="nums text-2xl font-semibold">{item.value.toLocaleString()}</h3>
                {item.delta ? <Badge className={badgeClass(item.tone)}>{item.delta}</Badge> : null}
              </div>
              <Button variant="outline" className="w-fit" asChild>
                <Link href={item.href}>
                  See statistics
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
