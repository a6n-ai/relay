import { PageDenied } from "./page-denied";

// The page half of a scoped loader's contract (components/lib/scoped-load.ts): `if (!loaded(page)) return <ScopedDenied page={page} />`.
export const loaded = <T extends object>(page: T | null): page is Exclude<T, { missing: true }> => !!page && !("missing" in page);

export function ScopedDenied({ page }: { page: null | { missing: true } }) {
  return page ? <PageDenied reason="not-found" label="App not found" /> : <PageDenied />;
}
