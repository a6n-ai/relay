"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Scroll-driven reveals for landing sections. Marks targets with `data-reveal`
 * (optional `data-reveal-stagger` for child stagger). Skips when the reader
 * prefers reduced motion. Visibility is not CSS-hidden so no-JS still reads.
 */
export function LandingScroll({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const blocks = gsap.utils.toArray<HTMLElement>("[data-reveal]", el);
      for (const block of blocks) {
        const staggerKids = block.hasAttribute("data-reveal-stagger");
        const targets = staggerKids
          ? gsap.utils.toArray<HTMLElement>(":scope > *", block)
          : [block];
        gsap.from(targets, {
          opacity: 0,
          y: 48,
          duration: 0.85,
          ease: "power2.out",
          stagger: staggerKids ? 0.12 : 0,
          scrollTrigger: {
            trigger: block,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        });
      }

      const hero = el.querySelector<HTMLElement>("[data-reveal-hero]");
      if (hero) {
        gsap.from(gsap.utils.toArray<HTMLElement>(":scope > *", hero), {
          opacity: 0,
          y: 28,
          duration: 0.9,
          ease: "power2.out",
          stagger: 0.1,
          delay: 0.05,
        });
      }

      const demo = el.querySelector<HTMLElement>("[data-reveal-demo]");
      if (demo) {
        gsap.from(demo, {
          opacity: 0,
          y: 64,
          duration: 1,
          ease: "power2.out",
          delay: 0.2,
        });
      }
    }, el);

    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);
    requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      window.removeEventListener("load", onLoad);
      ctx.revert();
    };
  }, []);

  return <div ref={root}>{children}</div>;
}
