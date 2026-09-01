"use client";

import { useEffect, useRef } from "react";

type Channel = "email" | "sms" | "whatsapp" | "in_app";

const CHANNELS: Channel[] = ["email", "sms", "whatsapp", "in_app"];
const LABELS: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  in_app: "In-app",
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  ch: Channel;
  t: number;
  seek: number;
};

function colorsFromCss(el: HTMLElement): Record<Channel, string> {
  const s = getComputedStyle(el);
  return {
    email: s.getPropertyValue("--chart-1").trim() || "#635bff",
    sms: s.getPropertyValue("--chart-2").trim() || "#7c75ff",
    whatsapp: s.getPropertyValue("--chart-3").trim() || "#9b95ff",
    in_app: s.getPropertyValue("--chart-4").trim() || "#bbb8ff",
  };
}

function docks(w: number, h: number): Record<Channel, { x: number; y: number }> {
  const y = h - 72;
  const gap = w / 5;
  return {
    email: { x: gap, y },
    sms: { x: gap * 2, y },
    whatsapp: { x: gap * 3, y },
    in_app: { x: gap * 4, y },
  };
}

function spawn(cx: number, cy: number, n: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const sp = 4.2 + Math.random() * 9.5;
    out.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      w: 5 + Math.random() * 10,
      h: 3 + Math.random() * 6,
      ch: CHANNELS[i % 4],
      t: 0,
      seek: 0.22 + Math.random() * 0.18,
    });
  }
  return out;
}

export function DispatchBurst() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const palette = colorsFromCss(canvas);
    const ink = getComputedStyle(canvas);
    const primary = ink.getPropertyValue("--primary").trim() || "#635bff";
    const muted = ink.getPropertyValue("--muted-foreground").trim() || "#888";
    const line = ink.getPropertyValue("--border").trim() || "#333";
    let particles: Particle[] = [];
    let raf = 0;
    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w * 0.5;
      cy = h * 0.42;
    };

    const burst = (ox = cx, oy = cy) => {
      particles = spawn(ox, oy, reduce ? 24 : 112);
    };

    const drawDocks = () => {
      const d = docks(w, h);
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      for (const ch of CHANNELS) {
        const p = d[ch];
        ctx.fillStyle = palette[ch];
        ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
        ctx.fillStyle = muted;
        ctx.fillText(LABELS[ch], p.x, p.y + 28);
      }
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      const d = docks(w, h);

      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (const ch of CHANNELS) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(d[ch].x, d[ch].y);
        ctx.stroke();
      }

      ctx.fillStyle = primary;
      ctx.fillRect(cx - 7, cy - 7, 14, 14);

      if (reduce) {
        drawDocks();
        return;
      }

      for (const p of particles) {
        p.t += 1;
        const dock = d[p.ch];
        if (p.t > 28) {
          p.vx += (dock.x - p.x) * p.seek * 0.04;
          p.vy += (dock.y - p.y) * p.seek * 0.04;
          p.vx *= 0.9;
          p.vy *= 0.9;
        } else {
          p.vy += 0.08;
          p.vx *= 0.992;
          p.vy *= 0.992;
        }
        p.x += p.vx;
        p.y += p.vy;
        ctx.fillStyle = palette[p.ch];
        ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      }
      drawDocks();
      raf = requestAnimationFrame(tick);
    };

    resize();
    burst();
    if (reduce) {
      ctx.clearRect(0, 0, w, h);
      drawDocks();
      ctx.fillStyle = primary;
      ctx.fillRect(cx - 7, cy - 7, 14, 14);
    } else {
      raf = requestAnimationFrame(tick);
    }

    const onClick = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      burst(e.clientX - r.left, e.clientY - r.top);
      if (reduce) return;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onResize = () => {
      resize();
      burst();
    };

    canvas.addEventListener("pointerdown", onClick);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onClick);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 size-full cursor-crosshair"
      aria-hidden
    />
  );
}
