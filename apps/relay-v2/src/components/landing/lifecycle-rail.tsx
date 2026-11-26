import { Fragment, useEffect, useState } from "react";

export const STAGES = [
  { id: "queued", label: "Queued", at: "12:04:01" },
  { id: "sent", label: "Sent", at: "12:04:02" },
  { id: "delivery", label: "Delivery", at: "12:04:04" },
] as const;

/** Queued, Sent and Delivery as the page's structure: ticks as each chapter reaches the middle of the screen. Static and fully ticked under reduced motion. */
export function LifecycleRail() {
  const [ticked, setTicked] = useState<number>(STAGES.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = STAGES.map((s) => document.getElementById(s.id));
    // Crossings fire the callback, but a fast jump skips whole chapters: read every chapter's position each time.
    const read = () => setTicked(els.filter((el) => el && el.getBoundingClientRect().top <= window.innerHeight * 0.46).length);
    const io = new IntersectionObserver(read, { rootMargin: "-45% 0px -54% 0px" });
    for (const s of STAGES) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <nav aria-label="Message lifecycle" className="ld-rail sticky top-0 z-20 border-b bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-8">
        <ol className="flex h-12 items-center gap-3 sm:gap-5">
          {STAGES.map((s, i) => (
            <Fragment key={s.id}>
              <li data-on={i < ticked || undefined} className="ld-stage">
                <a href={`#${s.id}`} aria-current={i === ticked - 1 ? "step" : undefined} className="ld-link inline-flex min-h-6 items-center gap-2 font-mono text-xs">
                  <span aria-hidden="true" className="ld-dot" />
                  {s.label}
                  <span className="ld-at hidden text-muted-foreground sm:inline">{s.at}</span>
                </a>
              </li>
              {i < STAGES.length - 1 ? (
                <li aria-hidden="true" data-on={i + 1 < ticked || undefined} className="ld-track">
                  <span className="ld-fill" />
                </li>
              ) : null}
            </Fragment>
          ))}
        </ol>
      </div>
    </nav>
  );
}
