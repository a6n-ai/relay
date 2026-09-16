"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { apiFetch } from "./api-fetch";

type LogRow = {
  publicId: string;
  channel: string;
  status: string;
  attempts: number;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: number;
  email: string | null;
  recipientEmail: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  sent: "text-ok",
  failed: "text-bad",
  pending: "text-muted-foreground",
  processing: "text-warn",
};

/**
 * Quick, unfiltered recent-sends view for a single campaign — the "Logs" tab
 * on its detail page. Deliberately doesn't reimplement the full facet/sort/
 * pagination Notifications > Logs page; "Open full log" links there
 * (pre-filtered by campaignId) for deeper search.
 */
export function CampaignLogsPanel({
  campaignPublicId,
  campaignId,
  formatTime,
}: {
  campaignPublicId: string;
  campaignId: string;
  formatTime: (ms: number) => string;
}) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ rows: LogRow[]; nextCursor: number | null }>(
      `/api/notifications/campaigns/${campaignPublicId}/logs`,
    ).then((res) => {
      if (cancelled) return;
      setRows(res.rows);
      setCursor(res.nextCursor);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignPublicId]);

  async function loadMore() {
    if (cursor == null) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch<{ rows: LogRow[]; nextCursor: number | null }>(
        `/api/notifications/campaigns/${campaignPublicId}/logs?cursor=${cursor}`,
      );
      setRows((prev) => [...(prev ?? []), ...res.rows]);
      setCursor(res.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/dashboard/notifications/logs?campaignId=${campaignId}`}>
            Open full log <ExternalLinkIcon className="size-3.5" />
          </Link>
        </Button>
      </div>
      {rows == null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No sends recorded yet.</p>
      ) : (
        <div className="divide-y text-sm">
          {rows.map((r) => (
            <div key={r.publicId} className="flex items-center justify-between gap-3 py-2">
              <span className="text-muted-foreground whitespace-nowrap tabular-nums">{formatTime(r.createdAt)}</span>
              <span className="text-muted-foreground">{r.channel}</span>
              <span className="min-w-0 flex-1 truncate">{r.email ?? r.recipientEmail ?? "—"}</span>
              <span className={STATUS_STYLE[r.status] ?? "text-muted-foreground"}>
                {r.status}
                {r.attempts > 1 && <span className="ml-1 text-xs">×{r.attempts}</span>}
              </span>
              {r.lastError && (
                <span className="max-w-[200px] truncate text-xs text-destructive" title={r.lastError}>
                  {r.lastError}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {cursor != null && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
