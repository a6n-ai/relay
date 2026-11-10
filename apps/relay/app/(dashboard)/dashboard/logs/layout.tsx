import type { ReactNode } from "react";
import { SectionTabs } from "@/components/ds/section-tabs";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs section="activity" label="Activity" />
      {children}
    </>
  );
}
