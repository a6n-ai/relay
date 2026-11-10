"use client";

import { useTheme } from "@foundry/themes";
import { useEffect, useState } from "react";

const FIGURES = {
  sorter: "/figures/hairline-sorter.html",
  nameplates: "/figures/hairline-nameplates.html",
  gauge: "/figures/hairline-gauge.html",
} as const;

/** Bump when figure HTML ground/embed CSS changes so iframes skip stale cache. */
const FIGURE_CACHE = "g3";

/**
 * Theme-aware Hairline embed. `play=1` starts the figure's tour on load so it
 * animates without a hover; a real pointer still takes over, then the tour
 * resumes when the hand leaves. Reduced motion is handled inside the figure.
 *
 * Ground must match the public page `--background` (#0f1011 / #fbfbfc). The
 * iframe paints `bg-background` before the document loads so the plate never
 * flashes a mismatched UA dark canvas.
 */
export function HairlineFigure({
  name,
  title,
  play = true,
}: {
  name: keyof typeof FIGURES;
  title: string;
  /** Auto-walk the tour (default on for landing columns). */
  play?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(resolvedTheme === "light" ? "light" : "dark");
  }, [resolvedTheme]);

  const src = `${FIGURES[name]}?embed=1&theme=${theme}&w=360${play ? "&play=1" : ""}&v=${FIGURE_CACHE}`;

  return (
    <iframe
      title={title}
      src={src}
      className="aspect-[5/4] w-full max-w-[280px] border-0 bg-background"
      loading="lazy"
    />
  );
}
