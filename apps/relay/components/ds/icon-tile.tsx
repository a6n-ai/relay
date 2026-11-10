import type { LucideIcon } from "lucide-react";
import { type IconColor, iconColorVar } from "./icon-color";

/** Decorative icon square for cards; coloured when given a colour. Hidden from assistive tech. */
export function IconTile({ icon: Icon, color }: { icon: LucideIcon; color?: IconColor }) {
  const c = color ? iconColorVar(color) : undefined;
  return (
    <span
      aria-hidden
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground [&_svg]:size-4"
      style={c ? { color: c, background: `color-mix(in oklch, ${c} 14%, transparent)`, borderColor: "transparent" } : undefined}
    >
      <Icon />
    </span>
  );
}
