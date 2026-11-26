import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Hero } from "./scenes/hero";

const SCENES: Record<string, ComponentType> = {
  campaigns: lazy(() => import("./scenes/campaigns")),
  lists: lazy(() => import("./scenes/lists")),
  webhooks: lazy(() => import("./scenes/webhooks")),
  inbound: lazy(() => import("./scenes/inbound")),
  send: lazy(() => import("./scenes/send")),
  domains: lazy(() => import("./scenes/domains")),
};

// The wide and compact designs have different shapes; the box holds the shape of whichever shows, so nothing shifts when a scene loads.
const SHAPE: Record<string, string> = {
  hero: "ld-shape-hero",
  campaigns: "ld-shape-card",
  lists: "ld-shape-lists",
  webhooks: "ld-shape-card",
  inbound: "ld-shape-tall",
  send: "ld-shape-tall",
  domains: "ld-shape-tall",
};

function Box({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <figure role="img" aria-label={label} data-ready={ready || undefined} className={`ld-scene ${SHAPE[name]} m-0 overflow-hidden rounded-md`}>
      <div aria-hidden="true">{children}</div>
    </figure>
  );
}

export function HeroScene({ label }: { label: string }) {
  return (
    <div className="ld-cq">
      <Box name="hero" label={label}>
        <Hero />
      </Box>
      <noscript>
        <style>{".ld-shape-hero{opacity:1!important}"}</style>
      </noscript>
    </div>
  );
}

/** Mounts the scene once it is near the viewport, so a visitor who never scrolls never downloads it. */
export function Scene({ name, label }: { name: keyof typeof SCENES; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  const Lazy = SCENES[name];
  return (
    <div ref={host} className="ld-cq">
      <Box name={name} label={label}>
        {near ? (
          <Suspense fallback={null}>
            <Lazy />
          </Suspense>
        ) : null}
      </Box>
    </div>
  );
}
