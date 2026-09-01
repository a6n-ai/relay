import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Card, CardContent } from "@foundry/ui/card";
import { insightCopy } from "./insight-copy";

export function InsightBanner({ pending, failed }: { pending: number; failed: number }) {
  const copy = insightCopy({ pending, failed });
  return (
    <Card className="h-full gap-0 py-3">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="relative flex items-center gap-2 ps-4">
            <span className="absolute left-0 inline-flex size-2 animate-ping rounded-full bg-chart-1" />
            <span className="absolute left-0 inline-flex size-2 rounded-full bg-chart-1" />
            <p className="text-sm font-medium">{copy.kicker}</p>
            <span className="size-1 rounded-full bg-border" />
            <p className="text-sm font-normal text-muted-foreground">Operator console</p>
          </div>
          <p className="text-sm font-normal text-pretty">{copy.body}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" asChild>
          <Link href={copy.href}>
            {copy.cta}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
