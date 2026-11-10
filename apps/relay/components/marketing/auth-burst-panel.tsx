"use client";

import dynamic from "next/dynamic";

const DispatchBurst = dynamic(
  () => import("./dispatch-burst").then((m) => ({ default: m.DispatchBurst })),
  { ssr: false },
);

export function AuthBurstPanel() {
  return (
    <div className="dark bg-background text-muted-foreground relative hidden min-h-80 flex-col justify-end md:flex">
      <DispatchBurst />
      <p className="pointer-events-none relative p-6 text-center text-sm text-balance">
        One send. Every channel it needs.
      </p>
    </div>
  );
}
