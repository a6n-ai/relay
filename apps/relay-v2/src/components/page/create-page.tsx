import type { FormEvent, ReactNode } from "react";
import { type Crumb, PageHeader } from "../shell/page-header";
import { FormPanel } from "./form-parts";

// A create flow on its own page: back link and title from the header, one card per section, the primary last.
export function CreatePage({ crumbs, description, onSubmit, children }: { crumbs: Crumb[]; description: string; onSubmit: (event: FormEvent) => void; children: ReactNode }) {
  return (
    <>
      <PageHeader crumbs={crumbs} description={description} />
      <FormPanel as="form" onSubmit={onSubmit} className="pt-2">
        {children}
      </FormPanel>
    </>
  );
}
