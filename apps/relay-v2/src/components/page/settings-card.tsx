import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@foundry/ui/card";
import type { ReactNode } from "react";
import { cn } from "@foundry/ui/cn";

export function SettingsCard({
  title,
  description,
  footer,
  disabledReason,
  action,
  children,
  tone = "default",
}: {
  title: string;
  description?: string;
  footer?: ReactNode; // muted hint, left of the footer strip
  disabledReason?: string; // follows the hint while the action is disabled
  action?: ReactNode; // the footer button, right
  children?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <Card className={cn(tone === "danger" && "ring-destructive/40")}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      {footer || disabledReason || action ? (
        <CardFooter className={cn("flex-wrap justify-between gap-3", tone === "danger" && "border-destructive/30 bg-destructive/5")}>
          <div className="min-w-0 text-sm text-muted-foreground">{footer}{footer && disabledReason ? " " : null}{disabledReason}</div>
          {action ? <div className="ml-auto">{action}</div> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
