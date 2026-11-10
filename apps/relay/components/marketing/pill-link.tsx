import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@foundry/ui/button";

type Props = { href: string; children: ReactNode; tone?: "solid" | "ghost"; size?: "sm" | "lg" };

const TONE = {
  solid: "bg-foreground text-background hover:bg-foreground/85",
  ghost: "border border-border bg-transparent text-foreground hover:bg-muted",
} as const;

/** The landing's pill: solid is ink on light and white on dark. */
export function PillLink({ href, children, tone = "solid", size = "lg" }: Props) {
  return (
    <Button asChild size={size} className={`rounded-full px-5 ${TONE[tone]}`}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
