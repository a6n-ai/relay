import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";

type Props = {
  href: string;
  children: ReactNode;
  tone?: "solid" | "ghost";
  size?: "sm" | "default" | "lg";
};

/**
 * Public CTA — Foundry Button, full-pill like Linear homepage (globals force
 * 9999px on every [data-slot=button]). Solid is invert; ghost is translucent.
 */
export function PillLink({ href, children, tone = "solid", size = "lg" }: Props) {
  return (
    <Button
      asChild
      size={size}
      variant={tone === "ghost" ? "outline" : "default"}
      className={cn(tone === "solid" && "marketing-cta-solid")}
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}
