import type { ComponentProps } from "react";
import { cn } from "@foundry/ui/cn";

export function Hint({ as: Tag = "p", size = "sm", className, ...props }: ComponentProps<"p"> & { as?: "p" | "span" | "div"; size?: "sm" | "xs" }) {
  return <Tag className={cn("text-muted-foreground", size === "xs" ? "text-xs" : "text-sm", className)} {...props} />;
}

export function Mono({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("font-mono text-xs", className)} {...props} />;
}

export function SectionTitle({ as: Tag = "h2", className, ...props }: ComponentProps<"h2"> & { as?: "h2" | "p" | "legend" }) {
  return <Tag className={cn("text-sm font-medium", className)} {...(props as object)} />;
}

export function Title({ as: Tag = "h1", className, ...props }: ComponentProps<"h1"> & { as?: "h1" | "h2" }) {
  return <Tag className={cn("text-lg font-medium", className)} {...props} />;
}
