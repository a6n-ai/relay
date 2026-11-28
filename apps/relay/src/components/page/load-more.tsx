import { Button } from "@foundry/ui/button";
import { Link } from "@tanstack/react-router";
import { Loader2Icon } from "lucide-react";
import type { FileRouteTypes } from "../../routeTree.gen";

const withoutOffset = (s?: Record<string, unknown>) => {
  if (!s) return s;
  const { offset: _o, ...rest } = s;
  return rest;
};

export function LoadMore({
  hasMore,
  loading = false,
  onMore,
  to,
  params,
  search,
  resetTo,
  resetSearch,
  offset,
  pageSize,
}: {
  hasMore: boolean;
  loading?: boolean;
  onMore?: () => void;
  to?: FileRouteTypes["to"];
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  resetTo?: FileRouteTypes["to"];
  resetSearch?: Record<string, unknown>;
  offset?: number;
  pageSize?: number;
}) {
  if (!hasMore && !resetTo) return null;
  const spinner = loading ? <Loader2Icon className="animate-spin" /> : null;
  return (
    <div className="flex items-center justify-center gap-2 p-4">
      {hasMore ? (
        to ? (
          <Button variant="outline" render={<Link to={to} params={params} search={pageSize === undefined ? search : { ...search, offset: (offset ?? 0) + pageSize }} />}>
            {spinner}Show older
          </Button>
        ) : (
          <Button variant="outline" disabled={loading} onClick={onMore}>
            {spinner}Show older
          </Button>
        )
      ) : null}
      {resetTo ? (
        <Button variant="ghost" render={<Link to={resetTo} params={params} search={withoutOffset(resetSearch)} />}>
          Back to newest
        </Button>
      ) : null}
    </div>
  );
}
