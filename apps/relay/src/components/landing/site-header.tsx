import { Button } from "@foundry/ui/button";
import type { ReactNode } from "react";
import "./landing.css";
import { DOCS_BASE } from "../../shared/site";
import { RelayMark } from "../relay-mark";

export const Wrap = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`mx-auto w-full max-w-6xl px-4 sm:px-8 ${className}`}>{children}</div>
);

export const big = (hero?: boolean) => (hero ? "h-11 px-5 text-base" : "");

export const Docs = ({ href = `${DOCS_BASE}/`, hero }: { href?: string; hero?: boolean }) => (
  <Button variant="outline" size={hero ? "lg" : "default"} className={`ld-docs ${big(hero)}`} render={<a href={href} />}>
    Docs
  </Button>
);

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b">
      <Wrap className="flex h-14 items-center justify-between">
        <RelayMark />
        <nav aria-label="Primary" className="flex items-center gap-2">
          <Docs />
          {children}
        </nav>
      </Wrap>
    </header>
  );
}
