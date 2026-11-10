import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@foundry/ui/cn";

/** DESIGN.md surface-1: one lift above the canvas, 1px hairline, radius-xl. Every boxed area uses this. */
export function Panel<T extends ElementType = "div">({
  as,
  className,
  children,
  ...rest
}: { as?: T; className?: string; children: ReactNode } & Omit<ComponentProps<T>, "as" | "className" | "children">) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={cn("overflow-hidden rounded-xl border border-border bg-card", className)} {...rest}>
      {children}
    </Tag>
  );
}
