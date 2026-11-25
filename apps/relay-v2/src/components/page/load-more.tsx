import { Button } from "@foundry/ui/button";
import { Link } from "@tanstack/react-router";
import { Loader2Icon } from "lucide-react";

export function LoadMore({
  hasMore,
  loading = false,
  onMore,
  to,
  search,
  resetTo,
}: {
  hasMore: boolean;
  loading?: boolean;
  onMore?: () => void;
  to?: string;
  search?: Record<string, unknown>;
  resetTo?: string;
}) {
  if (!hasMore && !resetTo) return null;
  const spinner = loading ? <Loader2Icon className="animate-spin" /> : null;
  return (
    <div className="flex items-center justify-center gap-2 p-4">
      {hasMore ? (
        to ? (
          <Button variant="outline" size="sm" render={<Link to={to as never} search={search as never} />}>
            {spinner}Show older
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={loading} onClick={onMore}>
            {spinner}Show older
          </Button>
        )
      ) : null}
      {resetTo ? (
        <Button variant="ghost" size="sm" render={<Link to={resetTo as never} />}>
          Back to newest
        </Button>
      ) : null}
    </div>
  );
}
