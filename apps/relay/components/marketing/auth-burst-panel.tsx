"use client";

import dynamic from "next/dynamic";

const DispatchBurst = dynamic(
  () => import("./dispatch-burst").then((m) => ({ default: m.DispatchBurst })),
  { ssr: false },
);

export function AuthBurstPanel() {
  return (
    <div className="dark bg-background text-muted-foreground hidden min-h-80 flex-col md:flex">
      {/* The burst fills its own box, so the caption sits under it, never over the channel labels. */}
      <div className="relative min-h-64 flex-1">
        <DispatchBurst />
      </div>
      <p className="pointer-events-none px-6 pb-6 text-center text-sm text-balance">
        One send. Every channel it needs.
      </p>
    </div>
  );
}
