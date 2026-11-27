import { DeniedState, deniedReason } from "../denied-state";
import { PageHeader } from "../shell/page-header";
import { type Shell } from "../../shared/views";

// The page half of a scoped loader's contract (components/lib/scoped-load.ts): `if (!loaded(page)) return <ScopedDenied page={page} shell={shell} />`.
export const loaded = <T extends object>(page: T | null): page is Exclude<T, { missing: true }> => !!page && !("missing" in page);

export function ScopedDenied({ page, shell }: { page: null | { missing: true }; shell: Shell }) {
  return (
    <>
      <PageHeader />
      {page ? <DeniedState reason="not-found" label="App not found" /> : <DeniedState reason={deniedReason(shell)} />}
    </>
  );
}
