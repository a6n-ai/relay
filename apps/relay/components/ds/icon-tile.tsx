import type { LucideIcon } from "lucide-react";

/** Decorative icon square for cards; hidden from assistive tech, never focusable. */
export function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground [&_svg]:size-4"
    >
      <Icon />
    </span>
  );
}
