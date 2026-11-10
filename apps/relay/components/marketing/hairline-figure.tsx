"use client";

import { useTheme } from "@foundry/themes";
import { useEffect, useState } from "react";

const FIGURES = {
  sorter: "/figures/hairline-sorter.html",
  nameplates: "/figures/hairline-nameplates.html",
  gauge: "/figures/hairline-gauge.html",
} as const;

/** Embeds a Hairline figure as a theme-aware iframe (controls hidden via ?embed=1). */
export function HairlineFigure({
  name,
  title,
}: {
  name: keyof typeof FIGURES;
  title: string;
}) {
  const { resolvedTheme } = useTheme();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(resolvedTheme === "light" ? "light" : "dark");
  }, [resolvedTheme]);

  const src = `${FIGURES[name]}?embed=1&theme=${theme}&w=360`;

  return (
    <iframe
      title={title}
      src={src}
      className="aspect-[5/4] w-full max-w-[280px] border-0 bg-transparent"
      loading="lazy"
    />
  );
}
