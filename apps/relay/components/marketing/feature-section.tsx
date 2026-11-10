import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

/** Heading and paragraph with a link, beside a slice of the console. */
export function FeatureSection({
  title,
  body,
  href,
  linkLabel,
  flip,
  children,
}: {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
  flip?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:gap-16 md:px-8 md:py-24">
        <div className={`flex flex-col items-start gap-5 ${flip ? "md:order-2" : ""}`}>
          <h2 className="text-3xl font-semibold tracking-[-0.022em] text-balance md:text-4xl">{title}</h2>
          <p className="max-w-md text-base leading-7 text-muted-foreground">{body}</p>
          <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline md:min-h-0">
            {linkLabel}
            <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
        <div className={`overflow-hidden rounded-xl border border-border bg-card ${flip ? "md:order-1" : ""}`}>{children}</div>
      </div>
    </section>
  );
}
