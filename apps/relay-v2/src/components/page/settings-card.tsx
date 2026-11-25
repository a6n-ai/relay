import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@foundry/ui/card";
import type { ReactNode } from "react";
import { cn } from "@foundry/ui/cn";

export function SettingsCard({
  title,
  description,
  footer,
  action,
  children,
  tone = "default",
}: {
  title: string;
  description?: string;
  footer?: ReactNode;
  action?: ReactNode;
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
      {footer || action ? (
        <CardFooter className={cn("justify-between gap-3", tone === "danger" && "border-destructive/30 bg-destructive/5")}>
          <div className="text-sm text-muted-foreground">{footer}</div>
          {action}
        </CardFooter>
      ) : null}
    </Card>
  );
}
